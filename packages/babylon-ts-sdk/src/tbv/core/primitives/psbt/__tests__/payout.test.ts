/**
 * Tests for buildPayoutPsbt and extractPayoutSignature primitive functions
 *
 * These tests verify the PSBT building and signature extraction logic for payout
 * transactions in the Babylon vault protocol.
 */

import { Buffer } from "buffer";

import {
  computePayoutFeeFloor,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { deriveBip86ScriptPubKeyHex } from "../../utils/bitcoin";
import { PAYOUT_ANCHOR_DUST_SATS } from "../constants";
import {
  buildPayoutPsbt,
  extractPayoutSignature,
  type PayoutParams,
} from "../payout";
import {
  DUMMY_TXID_2,
  NULL_TXID,
  SEQUENCE_MAX,
  TAPSCRIPT_LEAF_VERSION,
  TEST_CLAIM_VALUE,
  TEST_COMBINED_VALUE,
  TEST_OUTPUT_VALUE,
  TEST_PAYOUT_VALUE,
  TEST_PEGIN_VALUE,
  TEST_WITNESS_UTXO_VALUE,
  createDummyP2TR,
  createDummyP2WPKH,
} from "./constants";
import { TEST_KEYS, initializeWasmForTests } from "./helpers";

/**
 * Registered depositor payout scriptPubKey used by tests. Matches outs[0] of
 * the canonical VP-claimer test payout transaction (see
 * {@link createTestPayoutTransaction}).
 */
const REGISTERED_PAYOUT_SCRIPT_HEX = createDummyP2WPKH("a").toString("hex");

/**
 * Default commissionBps for VP-claimer tests. With `TEST_PEGIN_VALUE = 100_000`
 * the cap evaluates to `floor(100_000 * 500 / 10_000) = 5_000` sats, easily
 * above the canonical 1_000-sat commission output in
 * {@link createTestPayoutTransaction}.
 */
const TEST_COMMISSION_BPS = 500;

/**
 * Default graph-build fee rate for tests. With N=1 keeper + M=1 challenger the
 * device fee bound is `10 * (500 + 55*2) = 6_100` sats — above the canonical
 * 5_000-sat fixture fee, so accepting tests stay green.
 */
const TEST_PROTOCOL_FEE_RATE = 10n;

/** Council size forwarded to the fee floor; matches the golden generator. */
const TEST_COUNCIL_SIZE = 3;

/**
 * VP commission destination of the canonical test payout transaction
 * (see {@link createTestPayoutTransaction}, outs[1]).
 */
const CANONICAL_VP_COMMISSION_SCRIPT_HEX =
  createDummyP2WPKH("e").toString("hex");

/**
 * Keeper payout destinations for an operator that never called
 * `setPayoutScript`, where the registry backfills BIP-86 — so the registered
 * script and the local derivation are the same bytes.
 */
const DEFAULT_VK_PAYOUT_SCRIPTS: Readonly<Record<string, string>> = {
  [TEST_KEYS.VAULT_KEEPER_1.toLowerCase()]: deriveBip86ScriptPubKeyHex(
    TEST_KEYS.VAULT_KEEPER_1,
  ),
};

/**
 * Encodes a non-negative integer as a Bitcoin compact-size varint.
 * Matches the subset of varints supported by parseWitnessStack.
 */
function encodeVarInt(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(n, 1);
    return buf;
  }
  if (n <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(n, 1);
    return buf;
  }
  throw new Error(`varint too large for witness test helper: ${n}`);
}

/**
 * Serializes a witness stack in BIP-141 format:
 *   [varint item_count] [varint len, data]...
 */
function serializeWitnessStack(items: Buffer[]): Buffer {
  const parts: Buffer[] = [encodeVarInt(items.length)];
  for (const item of items) {
    parts.push(encodeVarInt(item.length));
    parts.push(item);
  }
  return Buffer.concat(parts);
}

/**
 * Builds a PSBT with a single input that already carries a finalScriptWitness,
 * simulating a wallet that auto-finalized the signed PSBT.
 */
function makeFinalizedPayoutPsbtHex(finalScriptWitness: Buffer): string {
  const psbt = new Psbt();
  psbt.addInput({
    hash: NULL_TXID,
    index: 0,
    witnessUtxo: {
      script: createDummyP2WPKH("0"),
      value: TEST_WITNESS_UTXO_VALUE,
    },
    finalScriptWitness,
  });
  return psbt.toHex();
}

/**
 * Creates a test pegin transaction with a single P2TR output (simplified for testing).
 */
function createTestPeginTransaction(): string {
  const tx = new Transaction();

  // Dummy coinbase-like input (all-zeros txid, max sequence)
  // This allows the transaction to serialize properly for testing
  tx.addInput(NULL_TXID, 0xffffffff, SEQUENCE_MAX);

  // P2TR output representing the vault address
  // Uses secp256k1 generator point for structurally valid but dummy pubkey
  tx.addOutput(createDummyP2TR(), Number(TEST_PEGIN_VALUE));

  return tx.toHex();
}

/**
 * Creates a test assert transaction (simplified for testing).
 * Single dummy output used to test multi-input Payout PSBT construction.
 */
function createTestAssertTransaction(): string {
  const tx = new Transaction();

  // Dummy input (distinct using DUMMY_TXID_2)
  tx.addInput(DUMMY_TXID_2, 0xffffffff, SEQUENCE_MAX);

  // P2WPKH dummy output (filled with 'c' for identification)
  tx.addOutput(createDummyP2WPKH("c"), Number(TEST_CLAIM_VALUE));

  return tx.toHex();
}

/**
 * Creates a Payout transaction in the VP-claimer canonical 3-output shape
 * required by `buildPayoutPsbt`'s per-role validation:
 *
 *   outs[0]: depositor payout — `createDummyP2WPKH("a")` (matches
 *            {@link REGISTERED_PAYOUT_SCRIPT_HEX})
 *   outs[1]: VP commission — `createDummyP2WPKH("e")` at 1_000 sats
 *            (under the cap for {@link TEST_COMMISSION_BPS} = 500 bps)
 *   outs[2]: CPFP anchor — 546 sats (`PAYOUT_ANCHOR_DUST_SATS`)
 *
 * Inputs are pegin (100_000) + claim (50_000) = 150_000; outputs sum to
 * 145_000 → implicit fee = 5_000, under the device bound (6_100 at rate 10).
 *
 * 2 inputs are required because Taproot SIGHASH_DEFAULT commits to all
 * prevouts.
 */
function createTestPayoutTransaction(
  peginTxHex: string,
  assertTxHex: string,
): string {
  const peginTx = Transaction.fromHex(peginTxHex);
  const assertTx = Transaction.fromHex(assertTxHex);
  const tx = new Transaction();

  // Input 0: Spend from pegin output (depositor must sign this)
  tx.addInput(Buffer.from(peginTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);

  // Input 1: Spend from assert output (after challenge path)
  tx.addInput(Buffer.from(assertTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);

  // outs[0]: depositor payout
  tx.addOutput(
    createDummyP2WPKH("a"),
    Number(TEST_COMBINED_VALUE) - (1_000 + PAYOUT_ANCHOR_DUST_SATS),
  );
  // outs[1]: VP commission
  tx.addOutput(createDummyP2WPKH("e"), 1_000);
  // outs[2]: CPFP anchor
  tx.addOutput(createDummyP2WPKH("c"), PAYOUT_ANCHOR_DUST_SATS);

  return tx.toHex();
}

/** Canonical PayoutParams for bound/role tests; override per case. */
function baseParams(overrides: Partial<PayoutParams>): PayoutParams {
  return {
    vaultCoreVersion: 1,
    payoutTxHex: "",
    peginTxHex: "",
    assertTxHex: "",
    depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
    vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
    vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
    universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
    timelockPegin: 100,
    network: "signet" as Network,
    claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
    registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
    commissionBps: TEST_COMMISSION_BPS,
    protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
    councilSize: TEST_COUNCIL_SIZE,
    // Defaults mirror an un-rotated network with no custom scripts, where the
    // registry backfills BIP-86 — the state testnet is in today. Tests that
    // care about a custom registration override these.
    vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
    vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
    ...overrides,
  };
}

/**
 * Deterministic distinct valid x-only pubkeys (scalar * G for scalars
 * offset..offset+count-1), sorted ascending as the protocol requires.
 */
function generateXOnlyKeys(count: number, offset: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const scalar = Buffer.alloc(32);
    scalar.writeUInt32BE(offset + i, 28);
    const point = ecc.pointFromScalar(scalar, true);
    if (!point) throw new Error(`invalid scalar ${offset + i}`);
    keys.push(Buffer.from(point.subarray(1, 33)).toString("hex"));
  }
  return keys.sort();
}

describe("buildPayoutPsbt", () => {
  // Initialize WASM before running tests
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Basic functionality", () => {
    it("should build a valid Payout PSBT with both inputs for correct sighash", async () => {
      // Create test transactions:
      // - PegIn: Contains vault output that depositor can sign
      // - Assert: Assert output from claimer (challenge path)
      // - Payout: Spends both pegin and assert outputs (required for correct sighash)
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);

      const params: PayoutParams = {
        vaultCoreVersion: 1,
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      };

      const result = await buildPayoutPsbt(params);

      // Verify result structure
      expect(result).toHaveProperty("psbtHex");
      expect(typeof result.psbtHex).toBe("string");
      expect(result.psbtHex.length).toBeGreaterThan(0);

      // Verify PSBT can be parsed - should have 2 inputs for correct sighash computation
      const psbt = Psbt.fromHex(result.psbtHex);
      expect(psbt.data.inputs.length).toBe(2);
      // VP-claimer canonical: [depositor payout, VP commission, CPFP anchor]
      expect(psbt.data.outputs.length).toBe(3);

      // Verify first input has Taproot script path spend info (depositor signs this)
      const firstInput = psbt.data.inputs[0];
      expect(firstInput.tapLeafScript).toBeDefined();
      expect(firstInput.tapLeafScript).toHaveLength(1);
      expect(firstInput.tapLeafScript![0].leafVersion).toBe(
        TAPSCRIPT_LEAF_VERSION,
      );
      expect(firstInput.tapInternalKey).toBeDefined();
      expect(firstInput.witnessUtxo).toBeDefined();

      // Verify second input has witnessUtxo but NO tapLeafScript (depositor doesn't sign this)
      const secondInput = psbt.data.inputs[1];
      expect(secondInput.witnessUtxo).toBeDefined();
      expect(secondInput.tapLeafScript).toBeUndefined();
    });

    it("should handle different networks", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);

      const networks: Network[] = ["testnet", "regtest"];

      for (const network of networks) {
        const params: PayoutParams = {
          vaultCoreVersion: 1,
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
          universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
          timelockPegin: 100,
          network,
          claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
          commissionBps: TEST_COMMISSION_BPS,
          protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
          councilSize: TEST_COUNCIL_SIZE,
          vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
          vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
        };

        const result = await buildPayoutPsbt(params);
        expect(result.psbtHex).toBeTruthy();

        const psbt = Psbt.fromHex(result.psbtHex);
        expect(psbt.data.inputs.length).toBe(2);
      }
    });

    it("should preserve transaction version and locktime", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);

      // Parse the payout transaction to check its version
      const payoutTx = Transaction.fromHex(payoutTxHex);

      const params: PayoutParams = {
        vaultCoreVersion: 1,
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      };

      const result = await buildPayoutPsbt(params);
      const psbt = Psbt.fromHex(result.psbtHex);

      // Should preserve the original transaction's version and locktime
      expect(psbt.version).toBe(payoutTx.version);
      expect(psbt.locktime).toBe(payoutTx.locktime);
    });
  });

  describe("Error handling", () => {
    it("should throw error when Payout transaction has fewer than 2 inputs", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();

      // Create a payout transaction with only 1 input (should fail since we need 2)
      const peginTx = Transaction.fromHex(peginTxHex);
      const wrongTx = new Transaction();
      wrongTx.addInput(
        Buffer.from(peginTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
      wrongTx.addOutput(createDummyP2WPKH("f"), Number(TEST_PAYOUT_VALUE));
      const payoutTxHex = wrongTx.toHex();

      const params: PayoutParams = {
        vaultCoreVersion: 1,
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      };

      await expect(buildPayoutPsbt(params)).rejects.toThrow(
        /must have exactly 2 inputs/,
      );
    });

    it("rejects payout when input 0 references the correct PegIn txid but a non-zero vout", async () => {
      // Multi-output PegIn so vout 1 exists and the vout check is what fires
      // (not the "Previous output not found" defensive check).
      const peginTx = new Transaction();
      peginTx.addInput(NULL_TXID, 0xffffffff, SEQUENCE_MAX);
      peginTx.addOutput(createDummyP2TR(), Number(TEST_PEGIN_VALUE));
      peginTx.addOutput(createDummyP2TR(), Number(TEST_PEGIN_VALUE));
      const peginTxHex = peginTx.toHex();

      const assertTxHex = createTestAssertTransaction();
      const assertTx = Transaction.fromHex(assertTxHex);

      const wrongTx = new Transaction();
      wrongTx.addInput(
        Buffer.from(peginTx.getId(), "hex").reverse(),
        1, // Correct PegIn txid, wrong vout
        SEQUENCE_MAX,
      );
      wrongTx.addInput(
        Buffer.from(assertTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
      wrongTx.addOutput(createDummyP2WPKH("f"), Number(TEST_PAYOUT_VALUE));
      const payoutTxHex = wrongTx.toHex();

      const params: PayoutParams = {
        vaultCoreVersion: 1,
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      };

      await expect(buildPayoutPsbt(params)).rejects.toThrow(
        /Input 0 must spend PegIn:0/,
      );
    });

    it("rejects payout when input 1 references the correct Assert txid but a non-zero vout", async () => {
      // Multi-output Assert so vout 1 exists.
      const peginTxHex = createTestPeginTransaction();
      const peginTx = Transaction.fromHex(peginTxHex);

      const assertTx = new Transaction();
      assertTx.addInput(DUMMY_TXID_2, 0xffffffff, SEQUENCE_MAX);
      assertTx.addOutput(createDummyP2WPKH("c"), Number(TEST_CLAIM_VALUE));
      assertTx.addOutput(createDummyP2WPKH("e"), Number(TEST_CLAIM_VALUE));
      const assertTxHex = assertTx.toHex();

      const wrongTx = new Transaction();
      wrongTx.addInput(
        Buffer.from(peginTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
      wrongTx.addInput(
        Buffer.from(assertTx.getId(), "hex").reverse(),
        1, // Correct Assert txid, wrong vout
        SEQUENCE_MAX,
      );
      wrongTx.addOutput(createDummyP2WPKH("f"), Number(TEST_PAYOUT_VALUE));
      const payoutTxHex = wrongTx.toHex();

      const params: PayoutParams = {
        vaultCoreVersion: 1,
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      };

      await expect(buildPayoutPsbt(params)).rejects.toThrow(
        /Input 1 must spend Assert:0/,
      );
    });
  });

  describe("Integration with WASM", () => {
    it("should successfully use WASM-generated payout script", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);

      const params: PayoutParams = {
        vaultCoreVersion: 1,
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      };

      const result = await buildPayoutPsbt(params);
      const psbt = Psbt.fromHex(result.psbtHex);

      // Verify the payout script is present (generated by WASM)
      const firstInput = psbt.data.inputs[0];
      expect(firstInput.tapLeafScript![0].script).toBeDefined();
      expect(firstInput.tapLeafScript![0].script.length).toBeGreaterThan(0);

      // Verify control block is present (computed by bitcoinjs-lib)
      expect(firstInput.tapLeafScript![0].controlBlock).toBeDefined();
      expect(firstInput.tapLeafScript![0].controlBlock.length).toBeGreaterThan(
        0,
      );
    });
  });
});

describe("extractPayoutSignature", () => {
  describe("Error handling", () => {
    it("should throw error when PSBT has no inputs", () => {
      const psbt = new Psbt();
      const psbtHex = psbt.toHex();

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/out of range/);
    });

    it("should throw error when no tapScriptSig is found", () => {
      // Create a PSBT with an input but no signature
      // This simulates a PSBT that hasn't been signed yet
      const psbt = new Psbt();
      psbt.addInput({
        hash: NULL_TXID,
        index: 0,
        witnessUtxo: {
          script: createDummyP2WPKH("0"),
          value: TEST_WITNESS_UTXO_VALUE,
        },
      });
      psbt.addOutput({
        script: createDummyP2WPKH("0"),
        value: TEST_OUTPUT_VALUE,
      });

      const psbtHex = psbt.toHex();

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/No tapScriptSig or finalScriptWitness found/);
    });

    it("should throw error when depositor signature not found in tapScriptSig", () => {
      // Create a PSBT with tapScriptSig but from a different pubkey
      const otherSig = Buffer.alloc(64, 0xdd);

      const psbt = new Psbt();
      psbt.addInput({
        hash: NULL_TXID,
        index: 0,
        witnessUtxo: {
          script: createDummyP2WPKH("0"),
          value: TEST_WITNESS_UTXO_VALUE,
        },
        tapScriptSig: [
          {
            pubkey: Buffer.from(TEST_KEYS.VAULT_PROVIDER, "hex"), // Different pubkey
            signature: otherSig,
            leafHash: Buffer.alloc(32, 0),
          },
        ],
      });

      const psbtHex = psbt.toHex();

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/No signature found for depositor pubkey/);
    });
  });

  describe("Signature extraction from non-finalized PSBT", () => {
    it("should extract 64-byte signature from tapScriptSig", () => {
      // Simulate a wallet signing the PSBT but not finalizing it
      // The signature is stored in tapScriptSig field
      const signature64 = Buffer.alloc(64, 0xaa);

      const psbt = new Psbt();
      psbt.addInput({
        hash: NULL_TXID,
        index: 0,
        witnessUtxo: {
          script: createDummyP2WPKH("0"),
          value: TEST_WITNESS_UTXO_VALUE,
        },
        tapScriptSig: [
          {
            pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
            signature: signature64,
            leafHash: Buffer.alloc(32, 0),
          },
        ],
      });

      const psbtHex = psbt.toHex();
      const extracted = extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR);

      expect(extracted).toBe(signature64.toString("hex"));
      expect(extracted.length).toBe(128); // 64 bytes = 128 hex chars
    });

    it("should reject 65-byte signature with SIGHASH_ALL", () => {
      const signature65 = Buffer.alloc(65);
      signature65.fill(0xbb, 0, 64); // Fill first 64 bytes
      signature65[64] = Transaction.SIGHASH_ALL;

      const psbt = new Psbt();
      psbt.addInput({
        hash: NULL_TXID,
        index: 0,
        witnessUtxo: {
          script: createDummyP2WPKH("0"),
          value: TEST_WITNESS_UTXO_VALUE,
        },
        tapScriptSig: [
          {
            pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
            signature: signature65,
            leafHash: Buffer.alloc(32, 0),
          },
        ],
      });

      const psbtHex = psbt.toHex();

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(
        /Unexpected sighash byte 0x01 at input 0\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
      );
    });

    it("should reject 65-byte signature with SIGHASH_NONE", () => {
      const signature65 = Buffer.alloc(65);
      signature65.fill(0xbb, 0, 64);
      signature65[64] = Transaction.SIGHASH_NONE;

      const psbt = new Psbt();
      psbt.addInput({
        hash: NULL_TXID,
        index: 0,
        witnessUtxo: {
          script: createDummyP2WPKH("0"),
          value: TEST_WITNESS_UTXO_VALUE,
        },
        tapScriptSig: [
          {
            pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
            signature: signature65,
            leafHash: Buffer.alloc(32, 0),
          },
        ],
      });

      const psbtHex = psbt.toHex();

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(
        /Unexpected sighash byte 0x02 at input 0\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
      );
    });

    it("should reject 65-byte signature with SIGHASH_SINGLE|ANYONECANPAY", () => {
      const signature65 = Buffer.alloc(65);
      signature65.fill(0xbb, 0, 64);
      signature65[64] =
        Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY;

      const psbt = new Psbt();
      psbt.addInput({
        hash: NULL_TXID,
        index: 0,
        witnessUtxo: {
          script: createDummyP2WPKH("0"),
          value: TEST_WITNESS_UTXO_VALUE,
        },
        tapScriptSig: [
          {
            pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
            signature: signature65,
            leafHash: Buffer.alloc(32, 0),
          },
        ],
      });

      const psbtHex = psbt.toHex();

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(
        /Unexpected sighash byte 0x83 at input 0\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
      );
    });
  });

  describe("Signature extraction from finalized PSBT", () => {
    it("extracts 64-byte signature from finalized witness [sig, script, controlBlock]", () => {
      const signature = Buffer.alloc(64, 0xaa);
      const script = Buffer.alloc(34, 0xbb);
      const controlBlock = Buffer.alloc(33, 0xcc);
      const finalScriptWitness = serializeWitnessStack([
        signature,
        script,
        controlBlock,
      ]);
      const psbtHex = makeFinalizedPayoutPsbtHex(finalScriptWitness);

      const extracted = extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR);

      expect(extracted).toBe(signature.toString("hex"));
      expect(extracted.length).toBe(128);
    });

    it("rejects SIGHASH_ALL flag in 65-byte signature from finalized witness", () => {
      const signature = Buffer.alloc(65);
      signature.fill(0xdd, 0, 64);
      signature[64] = Transaction.SIGHASH_ALL;
      const script = Buffer.alloc(34, 0xee);
      const controlBlock = Buffer.alloc(33, 0xff);
      const finalScriptWitness = serializeWitnessStack([
        signature,
        script,
        controlBlock,
      ]);
      const psbtHex = makeFinalizedPayoutPsbtHex(finalScriptWitness);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(
        /Unexpected sighash byte 0x01 at input 0\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
      );
    });

    it("rejects finalized witness with fewer than 3 items", () => {
      const signature = Buffer.alloc(64, 0xaa);
      const finalScriptWitness = serializeWitnessStack([signature]);
      const psbtHex = makeFinalizedPayoutPsbtHex(finalScriptWitness);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/expected 3 items.*got 1/);
    });

    it("rejects finalized witness with more than 3 items (multisig or annex)", () => {
      const sig1 = Buffer.alloc(64, 0xaa);
      const sig2 = Buffer.alloc(64, 0xbb);
      const script = Buffer.alloc(34, 0xcc);
      const controlBlock = Buffer.alloc(33, 0xdd);
      const finalScriptWitness = serializeWitnessStack([
        sig1,
        sig2,
        script,
        controlBlock,
      ]);
      const psbtHex = makeFinalizedPayoutPsbtHex(finalScriptWitness);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/expected 3 items.*got 4/);
    });

    it("rejects finalized witness whose first item is not a valid Schnorr signature length", () => {
      const invalidSig = Buffer.alloc(32, 0xaa);
      const script = Buffer.alloc(34, 0xbb);
      const controlBlock = Buffer.alloc(33, 0xcc);
      const finalScriptWitness = serializeWitnessStack([
        invalidSig,
        script,
        controlBlock,
      ]);
      const psbtHex = makeFinalizedPayoutPsbtHex(finalScriptWitness);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/Unexpected signature length at input 0/);
    });

    it("rejects malformed finalized witness that is truncated", () => {
      // Claims 1 item of length 64 but provides only 10 bytes of payload.
      const truncated = Buffer.concat([
        Buffer.from([0x01, 0x40]),
        Buffer.alloc(10, 0),
      ]);
      const psbtHex = makeFinalizedPayoutPsbtHex(truncated);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/Malformed witness data/);
    });

    it("rejects finalized witness with an 8-byte (0xff) varint", () => {
      // 0xff marks an 8-byte varint which is not used for witness item counts
      // and cannot be represented losslessly as a JS number.
      const malformed = Buffer.from([0xff, 0, 0, 0, 0, 0, 0, 0, 0]);
      const psbtHex = makeFinalizedPayoutPsbtHex(malformed);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/8-byte varint \(0xff\) not supported/);
    });

    it("rejects finalized witness with trailing bytes after the parsed stack", () => {
      const signature = Buffer.alloc(64, 0xaa);
      const script = Buffer.alloc(34, 0xbb);
      const controlBlock = Buffer.alloc(33, 0xcc);
      const withTrailing = Buffer.concat([
        serializeWitnessStack([signature, script, controlBlock]),
        Buffer.from([0xde, 0xad, 0xbe, 0xef]),
      ]);
      const psbtHex = makeFinalizedPayoutPsbtHex(withTrailing);

      expect(() =>
        extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR),
      ).toThrow(/trailing byte/);
    });
  });
});

/**
 * Per-role payout output validation lives inside `buildPayoutPsbt`. These
 * tests pin the contract: output count + outs[0].script + outs[last].value
 * per role, plus the VP-claimer commission cap.
 */
describe("buildPayoutPsbt — per-role output validation", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  /**
   * Builds a payout-shaped tx that spends pegin:0 and assert:0 (so the
   * prevout binding inside buildPayoutPsbt resolves) and produces the given
   * outputs.
   */
  function buildPayoutTxWithOutputs(
    peginTxHex: string,
    assertTxHex: string,
    outputs: { script: Buffer; value: number }[],
  ): string {
    const peginTx = Transaction.fromHex(peginTxHex);
    const assertTx = Transaction.fromHex(assertTxHex);
    const tx = new Transaction();
    tx.addInput(Buffer.from(peginTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);
    tx.addInput(
      Buffer.from(assertTx.getId(), "hex").reverse(),
      0,
      SEQUENCE_MAX,
    );
    for (const out of outputs) tx.addOutput(out.script, out.value);
    return tx.toHex();
  }

  it("VP-claimer: accepts a canonical 3-output payout", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);
    await expect(
      buildPayoutPsbt(baseParams({ payoutTxHex, peginTxHex, assertTxHex })),
    ).resolves.toBeDefined();
  });

  it("VP-claimer: rejects when an extra attacker output is appended", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 80_000 },
      { script: createDummyP2WPKH("e"), value: 1_000 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
      { script: createDummyP2WPKH("b"), value: 60_000 },
    ]);
    await expect(
      buildPayoutPsbt(baseParams({ payoutTxHex, peginTxHex, assertTxHex })),
    ).rejects.toThrow(/has 4 output\(s\), expected exactly 3/);
  });

  it("VP-claimer: rejects when outs[0] script differs from the registered scriptPubKey", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("b"), value: 143_454 },
      { script: createDummyP2WPKH("e"), value: 1_000 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);
    await expect(
      buildPayoutPsbt(baseParams({ payoutTxHex, peginTxHex, assertTxHex })),
    ).rejects.toThrow(
      /output 0 does not pay the expected scriptPubKey for role vp-claimer/,
    );
  });

  it("VP-claimer: rejects when outs[1] (commission) exceeds the cap", async () => {
    // commissionBps = 500 → cap = floor(100_000 * 500 / 10_000) = 5_000.
    // Set outs[1] to 6_000 → over the cap.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 138_454 },
      { script: createDummyP2WPKH("e"), value: 6_000 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);
    await expect(
      buildPayoutPsbt(baseParams({ payoutTxHex, peginTxHex, assertTxHex })),
    ).rejects.toThrow(
      /VP commission \(out 1\) value 6000 sats exceeds cap 5000 sats/,
    );
  });

  it("VP-claimer: rejects when CPFP anchor value (outs[2]) is not 546 sats", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 143_454 },
      { script: createDummyP2WPKH("e"), value: 1_000 },
      { script: createDummyP2WPKH("c"), value: 1_000 },
    ]);
    await expect(
      buildPayoutPsbt(baseParams({ payoutTxHex, peginTxHex, assertTxHex })),
    ).rejects.toThrow(
      /CPFP anchor \(out 2\) value 1000 sats must equal 546 sats/,
    );
  });

  it("VP-claimer: commissionBps 0 passes the structural guard but collapses the cap to 0", async () => {
    // The protocol minimum is enforced at the trust boundary
    // (prepareSigningContext), not here. buildPayoutPsbt only guards that the
    // cap math is meaningful: commissionBps 0 is structurally valid, but the
    // cap becomes floor(peginValue * 0 / 10_000) = 0, so the canonical
    // 1_000-sat commission output is rejected by the cap — fail-safe.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);
    await expect(
      buildPayoutPsbt(
        baseParams({ payoutTxHex, peginTxHex, assertTxHex, commissionBps: 0 }),
      ),
    ).rejects.toThrow(
      /VP commission \(out 1\) value 1000 sats exceeds cap 0 sats/,
    );
  });

  it("VP-claimer: rejects commissionBps at or above 10_000 (structural guard)", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          commissionBps: 10_000,
        }),
      ),
    ).rejects.toThrow(/commissionBps must be an integer in \[0, 10000\)/);
  });

  it("depositor-as-claimer: accepts a 2-output payout with registered script at outs[0]", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.DEPOSITOR,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("depositor-as-claimer: rejects when count is the VP-claimer shape (3 outputs)", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.DEPOSITOR,
        }),
      ),
    ).rejects.toThrow(
      /has 3 output\(s\), expected exactly 2 for role depositor-as-claimer/,
    );
  });

  it("depositor-as-claimer: rejects when CPFP anchor value (outs[1]) is not 546 sats", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_000 },
      { script: createDummyP2WPKH("c"), value: 1_000 },
    ]);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.DEPOSITOR,
        }),
      ),
    ).rejects.toThrow(
      /CPFP anchor \(out 1\) value 1000 sats must equal 546 sats/,
    );
  });

  it("vk-claimer: accepts a 2-output payout with outs[0] = bip86(vk)", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const vkScriptHex = deriveBip86ScriptPubKeyHex(TEST_KEYS.VAULT_KEEPER_1);
    // deriveBip86ScriptPubKeyHex returns a `0x`-prefixed hex string; strip
    // the prefix before constructing the raw script buffer.
    const vkScript = Buffer.from(vkScriptHex.replace(/^0x/, ""), "hex");
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: vkScript, value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("vk-claimer: rejects when outs[0] script differs from bip86(vk)", async () => {
    // outs[0] uses the registered depositor script instead of bip86(vk) —
    // mirrors a VP trying to redirect VK payout to the depositor address.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
        }),
      ),
    ).rejects.toThrow(
      /output 0 does not pay the expected scriptPubKey for role vk-claimer/,
    );
  });

  it("vk-claimer: pays the registered payout script instead of bip86(vk)", async () => {
    // The RFC-006 case that breaks the legacy path: a keeper whose payouts go
    // to cold custody, not to the BIP-86 address of its operation key.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const registeredScript = createDummyP2WPKH("d");
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: registeredScript, value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
          vkClaimerPayoutScriptPubKeys: {
            [TEST_KEYS.VAULT_KEEPER_1.toLowerCase()]:
              registeredScript.toString("hex"),
          },
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("vk-claimer: accepts bip86(vk) when a different script is registered", async () => {
    // Legacy graph: built before btc-vault#2440, so the daemon derived the
    // keeper destination locally. Graphs are never rebuilt, so rejecting this
    // would strand the vault permanently.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const bip86Script = Buffer.from(
      deriveBip86ScriptPubKeyHex(TEST_KEYS.VAULT_KEEPER_1).replace(/^0x/, ""),
      "hex",
    );
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: bip86Script, value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    const result = await buildPayoutPsbt(
      baseParams({
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
        vkClaimerPayoutScriptPubKeys: {
          [TEST_KEYS.VAULT_KEEPER_1.toLowerCase()]:
            createDummyP2WPKH("d").toString("hex"),
        },
      }),
    );

    expect(result.psbtHex).toBeTruthy();
  });

  it("vk-claimer: rejects a script that is neither registered nor bip86(vk)", async () => {
    // Dual-accept widens the accepted set to exactly two operator-controlled
    // destinations. A third script is still a diversion.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("f"), value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
          vkClaimerPayoutScriptPubKeys: {
            [TEST_KEYS.VAULT_KEEPER_1.toLowerCase()]:
              createDummyP2WPKH("d").toString("hex"),
          },
        }),
      ),
    ).rejects.toThrow(
      /output 0 does not pay the expected scriptPubKey for role vk-claimer/,
    );
  });

  it("vk-claimer: rejects a claimer missing from the resolved script map", async () => {
    // Must never silently fall back to BIP-86 — a gap means the resolution was
    // incomplete, not that this keeper is on the default.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("d"), value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
          vkClaimerPayoutScriptPubKeys: {},
        }),
      ),
    ).rejects.toThrow(/No registered payout script resolved for vault keeper/);
  });

  it("vk-claimer: rejects an unspendable registered payout script", async () => {
    // The registry stores whatever the operator wrote. Pinning outs[0] to an
    // OP_RETURN would have the depositor pre-sign an unclaimable payout.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const opReturn = Buffer.from("6a0401020304", "hex");
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: opReturn, value: 144_454 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_KEEPER_1,
          vkClaimerPayoutScriptPubKeys: {
            [TEST_KEYS.VAULT_KEEPER_1.toLowerCase()]: opReturn.toString("hex"),
          },
        }),
      ),
    ).rejects.toThrow(/provably unspendable/);
  });

  it("vp-claimer: pins outs[1] to the registered commission script", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const commissionScript = createDummyP2WPKH("e");
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_454 },
      { script: commissionScript, value: 100 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vpCommissionScriptPubKey: commissionScript.toString("hex"),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("vp-claimer: rejects a substituted commission destination", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_454 },
      { script: createDummyP2WPKH("f"), value: 100 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vpCommissionScriptPubKey: createDummyP2WPKH("e").toString("hex"),
        }),
      ),
    ).rejects.toThrow(
      /output 1 does not pay the vault provider's commission scriptPubKey/,
    );
  });

  it("vp-claimer: accepts a bip86(vp) commission when a custom script is registered", async () => {
    // Legacy graph: built before btc-vault#2440, so the daemon derived the
    // commission destination locally. Graphs are never rebuilt, so rejecting
    // this would strand the vault permanently.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const bip86VpScript = Buffer.from(
      deriveBip86ScriptPubKeyHex(TEST_KEYS.VAULT_PROVIDER).replace(/^0x/, ""),
      "hex",
    );
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_454 },
      { script: bip86VpScript, value: 100 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    const result = await buildPayoutPsbt(
      baseParams({
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vpCommissionScriptPubKey: createDummyP2WPKH("e").toString("hex"),
      }),
    );

    expect(result.psbtHex).toBeTruthy();
  });

  it("vp-claimer: still enforces the commission value cap when the script matches", async () => {
    // The script pin is added precision, not a replacement for the value cap.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const commissionScript = createDummyP2WPKH("e");
    const payoutTxHex = buildPayoutTxWithOutputs(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 144_454 },
      { script: commissionScript, value: 999_999_999 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vpCommissionScriptPubKey: commissionScript.toString("hex"),
        }),
      ),
    ).rejects.toThrow(/exceeds cap/);
  });

  it("unknown claimer: rejects pubkey not matching VP, depositor, or any registered VK", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = createTestPayoutTransaction(peginTxHex, assertTxHex);
    const strangerPubkey = "1".repeat(64);
    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          claimerBtcPubkey: strangerPubkey,
        }),
      ),
    ).rejects.toThrow(/Unknown claimer pubkey/);
  });
});

/**
 * The output-structure guard alone is not enough: a VP could keep the
 * registered script at vout 0 and the right output count, then deflate the
 * values so the missing amount is paid to miners as implicit fee. The bound
 * inside `buildPayoutPsbt` catches this once the input amounts are pinned by
 * the prevout binding.
 */
describe("buildPayoutPsbt — fee-band and domain wiring", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  function makeDeflatedPayoutTxHex(
    peginTxHex: string,
    assertTxHex: string,
    outputs: { script: Buffer; value: number }[],
  ): string {
    const peginTx = Transaction.fromHex(peginTxHex);
    const assertTx = Transaction.fromHex(assertTxHex);
    const tx = new Transaction();
    tx.addInput(Buffer.from(peginTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);
    tx.addInput(
      Buffer.from(assertTx.getId(), "hex").reverse(),
      0,
      SEQUENCE_MAX,
    );
    for (const out of outputs) tx.addOutput(out.script, out.value);
    return tx.toHex();
  }

  /** VP-claimer 3-output payout paying exactly `feeSats` of implicit fee. */
  function makePayoutWithFee(
    peginTxHex: string,
    assertTxHex: string,
    feeSats: number,
    inputTotalSats = Number(TEST_PEGIN_VALUE) + Number(TEST_CLAIM_VALUE),
  ): string {
    const commission = 1_000;
    return makeDeflatedPayoutTxHex(peginTxHex, assertTxHex, [
      {
        script: createDummyP2WPKH("a"),
        value: inputTotalSats - feeSats - commission - PAYOUT_ANCHOR_DUST_SATS,
      },
      { script: createDummyP2WPKH("e"), value: commission },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);
  }

  it("rejects a payout whose implicit fee exceeds the device bound (value-burn variant)", async () => {
    // Inputs = TEST_PEGIN_VALUE (100_000) + TEST_CLAIM_VALUE (50_000) = 150_000.
    // Bound = 10 sat/vB * (500 + 55*(1+1)) = 6_100 sats. Deflate the depositor
    // output so the fee is 50_000 → trip the bound. Keep the canonical
    // VP-claimer 3-output shape so role validation passes before the fee check.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makePayoutWithFee(peginTxHex, assertTxHex, 50_000);

    await expect(
      buildPayoutPsbt(baseParams({ payoutTxHex, assertTxHex, peginTxHex })),
    ).rejects.toThrow(/implicit fee 50000 sats exceeds the safety cap/);
  });

  it("small vault + 32/32 participants: accepts a protocol-correct fee the old 10% cap refused", async () => {
    // The #2105 scenario: 500_000-sat vault, N=M=32, 15 sat/vB. The VP's fee
    // (rate x exact vsize ≈ 53_160, here 58_000 to sit above the old cap) is
    // within the device bound 15 * (500 + 55*64) = 60_300, but exceeds 10% of
    // the 550_000-sat input total (55_000) — the old cap rejected it.
    const smallVaultPegin = (() => {
      const tx = new Transaction();
      tx.addInput(NULL_TXID, 0xffffffff, SEQUENCE_MAX);
      tx.addOutput(createDummyP2TR(), 500_000);
      return tx.toHex();
    })();
    const assertTxHex = createTestAssertTransaction();
    const inputTotal = 500_000 + Number(TEST_CLAIM_VALUE);
    const payoutTxHex = makePayoutWithFee(
      smallVaultPegin,
      assertTxHex,
      58_000,
      inputTotal,
    );

    await expect(
      buildPayoutPsbt(
        baseParams({
          payoutTxHex,
          assertTxHex,
          peginTxHex: smallVaultPegin,
          vaultKeeperBtcPubkeys: generateXOnlyKeys(32, 1_000),
          universalChallengerBtcPubkeys: generateXOnlyKeys(32, 2_000),
          protocolFeeRate: 15n,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("accepts a payout paying exactly the floor and rejects one sat below", async () => {
    // Floor = the smallest fee any known VP output-sizing model produces,
    // recomputed here through the same WASM export production consults.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    // Fixture scripts are P2WPKH: out0 = 22 bytes (registered), out1 = 22.
    const floor = await computePayoutFeeFloor(
      1,
      1,
      1,
      1,
      TEST_COUNCIL_SIZE,
      22,
      22,
      TEST_PROTOCOL_FEE_RATE,
    );

    const atFloor = makePayoutWithFee(peginTxHex, assertTxHex, Number(floor));
    await expect(
      buildPayoutPsbt(
        baseParams({ payoutTxHex: atFloor, assertTxHex, peginTxHex }),
      ),
    ).resolves.toBeDefined();

    const belowFloor = makePayoutWithFee(
      peginTxHex,
      assertTxHex,
      Number(floor) - 1,
    );
    await expect(
      buildPayoutPsbt(
        baseParams({ payoutTxHex: belowFloor, assertTxHex, peginTxHex }),
      ),
    ).rejects.toThrow(/below the floor/);
  });

  it("floors correctly when keeper and challenger counts differ", async () => {
    // N != M distinguishes the local-challenger slot (= keepers) from the
    // challenger slot in the floor call — a swap shifts the floor.
    const keepers = generateXOnlyKeys(2, 5_000);
    const challenger = [TEST_KEYS.UNIVERSAL_CHALLENGER_1];
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const floor = await computePayoutFeeFloor(
      1,
      2,
      1,
      2,
      TEST_COUNCIL_SIZE,
      22,
      22,
      TEST_PROTOCOL_FEE_RATE,
    );
    const overrides = {
      assertTxHex,
      peginTxHex,
      vaultKeeperBtcPubkeys: keepers,
      universalChallengerBtcPubkeys: challenger,
    };

    await expect(
      buildPayoutPsbt(
        baseParams({
          ...overrides,
          payoutTxHex: makePayoutWithFee(
            peginTxHex,
            assertTxHex,
            Number(floor),
          ),
        }),
      ),
    ).resolves.toBeDefined();
    await expect(
      buildPayoutPsbt(
        baseParams({
          ...overrides,
          payoutTxHex: makePayoutWithFee(
            peginTxHex,
            assertTxHex,
            Number(floor) - 1,
          ),
        }),
      ),
    ).rejects.toThrow(/below the floor/);
  });

  it("extends the ceiling by measured script excess for a 128-byte registered script", async () => {
    // Contract-legal 128-byte registered payout script: the flat device bound
    // (6_100) would reject a legitimate fee; the extended ceiling admits it.
    const bigScript = Buffer.alloc(128, 0x51);
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const inputTotal = Number(TEST_PEGIN_VALUE) + Number(TEST_CLAIM_VALUE);
    const makeBigScriptPayout = (feeSats: number) =>
      makeDeflatedPayoutTxHex(peginTxHex, assertTxHex, [
        {
          script: bigScript,
          value: inputTotal - feeSats - 1_000 - PAYOUT_ANCHOR_DUST_SATS,
        },
        { script: createDummyP2WPKH("e"), value: 1_000 },
        { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
      ]);
    const params = (payoutTxHex: string) =>
      baseParams({
        payoutTxHex,
        assertTxHex,
        peginTxHex,
        registeredPayoutScriptPubKey: bigScript.toString("hex"),
      });

    // Extended ceiling = 10 * (610 + (128 - 34)) = 7_040.
    await expect(
      buildPayoutPsbt(params(makeBigScriptPayout(7_040))),
    ).resolves.toBeDefined();
    await expect(
      buildPayoutPsbt(params(makeBigScriptPayout(7_041))),
    ).rejects.toThrow(/exceeds the safety cap/);
  });

  it("rejects participant counts outside the device range", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makePayoutWithFee(peginTxHex, assertTxHex, 5_000);
    const params = baseParams({ payoutTxHex, assertTxHex, peginTxHex });

    await expect(
      buildPayoutPsbt({
        ...params,
        vaultKeeperBtcPubkeys: generateXOnlyKeys(33, 3_000),
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      }),
    ).rejects.toThrow(/device range/);
    await expect(
      buildPayoutPsbt({
        ...params,
        universalChallengerBtcPubkeys: generateXOnlyKeys(33, 4_000),
      }),
    ).rejects.toThrow(/device range/);
  });

  it("rejects a councilSize outside the accepted domain", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makePayoutWithFee(peginTxHex, assertTxHex, 5_000);
    const params = baseParams({ payoutTxHex, assertTxHex, peginTxHex });

    await expect(
      buildPayoutPsbt({ ...params, councilSize: 0 }),
    ).rejects.toThrow(/councilSize must be an integer/);
  });

  it("rejects a non-positive or above-u32 protocolFeeRate before any validation", async () => {
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makePayoutWithFee(peginTxHex, assertTxHex, 5_000);
    const params = baseParams({ payoutTxHex, assertTxHex, peginTxHex });

    await expect(
      buildPayoutPsbt({ ...params, protocolFeeRate: 0n }),
    ).rejects.toThrow(/protocolFeeRate must be in/);
    // The device's intent parser rejects base_fee_rate > UINT32_MAX.
    await expect(
      buildPayoutPsbt({ ...params, protocolFeeRate: 0x1_0000_0000n }),
    ).rejects.toThrow(/protocolFeeRate must be in/);
  });

  it("rejects a payout whose outputs exceed inputs (negative implicit fee)", async () => {
    // Outputs (200_000) > inputs (150_000) — invalid Bitcoin transaction,
    // caught before any signing.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makeDeflatedPayoutTxHex(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 198_454 },
      { script: createDummyP2WPKH("e"), value: 1_000 },
      { script: createDummyP2WPKH("c"), value: PAYOUT_ANCHOR_DUST_SATS },
    ]);

    await expect(
      buildPayoutPsbt({
        vaultCoreVersion: 1,
        payoutTxHex,
        assertTxHex,
        peginTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
        claimerBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT_HEX,
        commissionBps: TEST_COMMISSION_BPS,
        protocolFeeRate: TEST_PROTOCOL_FEE_RATE,
        councilSize: TEST_COUNCIL_SIZE,
        vkClaimerPayoutScriptPubKeys: DEFAULT_VK_PAYOUT_SCRIPTS,
        vpCommissionScriptPubKey: CANONICAL_VP_COMMISSION_SCRIPT_HEX,
      }),
    ).rejects.toThrow(/outputs \(200000 sats\) exceed inputs/);
  });
});
