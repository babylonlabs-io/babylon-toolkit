/**
 * Tests for buildPayoutPsbt and extractPayoutSignature primitive functions
 *
 * These tests verify the PSBT building and signature extraction logic for payout
 * transactions in the Babylon vault protocol.
 */

import { Buffer } from "buffer";

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertPayoutOutputMatchesRegistered,
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
 * Creates a Payout transaction (simplified for testing).
 * 2 inputs (pegin + assert) required because Taproot SIGHASH_DEFAULT commits to all prevouts.
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
  // REQUIRED: Taproot SIGHASH_DEFAULT commits to ALL inputs' prevouts
  tx.addInput(Buffer.from(assertTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);

  // Output: Payment to recipient
  // Amount: TEST_PEGIN_VALUE + TEST_CLAIM_VALUE - 5000 sats fee
  tx.addOutput(createDummyP2WPKH("a"), Number(TEST_COMBINED_VALUE));

  return tx.toHex();
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
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
      };

      const result = await buildPayoutPsbt(params);

      // Verify result structure
      expect(result).toHaveProperty("psbtHex");
      expect(typeof result.psbtHex).toBe("string");
      expect(result.psbtHex.length).toBeGreaterThan(0);

      // Verify PSBT can be parsed - should have 2 inputs for correct sighash computation
      const psbt = Psbt.fromHex(result.psbtHex);
      expect(psbt.data.inputs.length).toBe(2);
      expect(psbt.data.outputs.length).toBe(1);

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
          payoutTxHex,
          peginTxHex,
          assertTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
          universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
          timelockPegin: 100,
          network,
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
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
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
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
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
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
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
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
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
        payoutTxHex,
        peginTxHex,
        assertTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
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
      signature65[64] = Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY;

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
 * Regression coverage for [baby-auditor-findings#147]. The pre-fix
 * `largestOutput` reducer accepted a payout tx whose registered output stayed
 * the largest while extra attacker outputs drained the remainder, and a
 * value-burn variant where outputs were deflated and the difference went to
 * miner fee. These tests pin the new contract: exact output count, registered
 * script anchored at vout 0, implicit fee bounded.
 */
describe("assertPayoutOutputMatchesRegistered — output-structure guard (#147)", () => {
  // Use the same dummy P2WPKH that the existing test payout transactions use.
  // The hex (one byte differs per `seed`) is the registered script we anchor
  // the check against.
  const REGISTERED_SCRIPT = createDummyP2WPKH("a");
  const REGISTERED_SCRIPT_HEX = REGISTERED_SCRIPT.toString("hex");
  const ATTACKER_SCRIPT = createDummyP2WPKH("b");

  /**
   * Builds a payout-shaped transaction with the given outputs. Inputs are
   * placeholder — this function only exercises the output-side guard, not the
   * full sighash machinery.
   */
  function makePayoutTxHex(
    outputs: { script: Buffer; value: number }[],
  ): string {
    const tx = new Transaction();
    tx.addInput(NULL_TXID, 0, SEQUENCE_MAX);
    tx.addInput(DUMMY_TXID_2, 0, SEQUENCE_MAX);
    for (const out of outputs) tx.addOutput(out.script, out.value);
    return tx.toHex();
  }

  it("accepts a VP-claimer 3-output payout with registered script at vout 0", () => {
    // [depositor payout, VP commission, CPFP anchor] — protocol shape.
    const payoutHex = makePayoutTxHex([
      { script: REGISTERED_SCRIPT, value: 90_000 },
      { script: createDummyP2TR(), value: 1_000 },
      { script: createDummyP2TR(), value: 546 },
    ]);
    expect(() =>
      assertPayoutOutputMatchesRegistered(payoutHex, REGISTERED_SCRIPT_HEX, 3),
    ).not.toThrow();
  });

  it("accepts a depositor-as-claimer 2-output payout with registered script at vout 0", () => {
    // [payout, CPFP anchor] — no VP commission for depositor-as-claimer.
    const payoutHex = makePayoutTxHex([
      { script: REGISTERED_SCRIPT, value: 90_000 },
      { script: createDummyP2TR(), value: 546 },
    ]);
    expect(() =>
      assertPayoutOutputMatchesRegistered(payoutHex, REGISTERED_SCRIPT_HEX, 2),
    ).not.toThrow();
  });

  it("rejects the #147 PoC: registered output is largest but extra attacker outputs are appended", () => {
    // Mirrors the audit PoC: registered output (51% of inputs) is largest,
    // attacker outputs make up the rest. Pre-fix `largestOutput` reducer
    // accepted this; the new count check rejects it.
    const payoutHex = makePayoutTxHex([
      { script: REGISTERED_SCRIPT, value: 51_000 },
      { script: ATTACKER_SCRIPT, value: 24_000 },
      { script: ATTACKER_SCRIPT, value: 24_000 },
      { script: createDummyP2TR(), value: 546 },
    ]);
    expect(() =>
      assertPayoutOutputMatchesRegistered(payoutHex, REGISTERED_SCRIPT_HEX, 3),
    ).toThrow(/has 4 output\(s\), expected exactly 3/);
  });

  it("rejects when output count matches but registered script is at vout 1 instead of vout 0", () => {
    // Pre-fix would have passed this (registered output is largest).
    // Anchoring the check at index 0 closes it.
    const payoutHex = makePayoutTxHex([
      { script: ATTACKER_SCRIPT, value: 1_000 },
      { script: REGISTERED_SCRIPT, value: 90_000 },
      { script: createDummyP2TR(), value: 546 },
    ]);
    expect(() =>
      assertPayoutOutputMatchesRegistered(payoutHex, REGISTERED_SCRIPT_HEX, 3),
    ).toThrow(/output 0 does not pay to the registered depositor payout/);
  });

  it("rejects when output count is too low (e.g. 2 outputs supplied for a VP-claimer 3-output role)", () => {
    const payoutHex = makePayoutTxHex([
      { script: REGISTERED_SCRIPT, value: 90_000 },
      { script: createDummyP2TR(), value: 546 },
    ]);
    expect(() =>
      assertPayoutOutputMatchesRegistered(payoutHex, REGISTERED_SCRIPT_HEX, 3),
    ).toThrow(/has 2 output\(s\), expected exactly 3/);
  });

  it("rejects a zero or non-integer expectedOutputCount as a programming-error guard", () => {
    const payoutHex = makePayoutTxHex([
      { script: REGISTERED_SCRIPT, value: 90_000 },
    ]);
    expect(() =>
      assertPayoutOutputMatchesRegistered(payoutHex, REGISTERED_SCRIPT_HEX, 0),
    ).toThrow(/expectedOutputCount must be a positive integer/);
    expect(() =>
      assertPayoutOutputMatchesRegistered(
        payoutHex,
        REGISTERED_SCRIPT_HEX,
        1.5,
      ),
    ).toThrow(/expectedOutputCount must be a positive integer/);
  });
});

/**
 * Regression coverage for the value-burn half of [#147]. The output-structure
 * guard alone is not enough: a VP could keep the registered script at vout 0
 * and the right output count, then deflate the values so the missing amount
 * is paid to miners as implicit fee. The bound inside `buildPayoutPsbt`
 * catches this once the input amounts are pinned by the prevout binding
 * (PR #1673).
 */
describe("buildPayoutPsbt — implicit-fee bound (#147 value-burn variant)", () => {
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

  it("rejects a payout whose implicit fee exceeds 10% of inputs (value-burn variant)", async () => {
    // Inputs = TEST_PEGIN_VALUE (100_000) + TEST_CLAIM_VALUE (50_000) = 150_000.
    // 10% cap → max fee 15_000. Output sum 100_000 → fee 50_000 → trip the bound.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makeDeflatedPayoutTxHex(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 100_000 },
    ]);

    await expect(
      buildPayoutPsbt({
        payoutTxHex,
        assertTxHex,
        peginTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
      }),
    ).rejects.toThrow(/implicit fee 50000 sats exceeds the safety cap/);
  });

  it("rejects a payout whose outputs exceed inputs (negative implicit fee)", async () => {
    // Outputs (200_000) > inputs (150_000) — invalid Bitcoin transaction,
    // caught before any signing.
    const peginTxHex = createTestPeginTransaction();
    const assertTxHex = createTestAssertTransaction();
    const payoutTxHex = makeDeflatedPayoutTxHex(peginTxHex, assertTxHex, [
      { script: createDummyP2WPKH("a"), value: 200_000 },
    ]);

    await expect(
      buildPayoutPsbt({
        payoutTxHex,
        assertTxHex,
        peginTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
      }),
    ).rejects.toThrow(/outputs \(200000 sats\) exceed inputs/);
  });
});
