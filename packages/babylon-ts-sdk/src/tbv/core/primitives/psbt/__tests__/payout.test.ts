/**
 * Tests for buildPayoutPsbt and extractPayoutSignature primitive functions
 *
 * These tests verify the PSBT building and signature extraction logic for payout
 * transactions in the Babylon vault protocol. Test structure follows Rust patterns
 * from etc/btc-vault/crates/vault/tests.
 */

import { Buffer } from "buffer";

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildPayoutPsbt,
  extractPayoutSignature,
  type PayoutParams,
} from "../payout";
import {
  DUMMY_TXID_1,
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
 * Creates a test pegin transaction with a single P2TR output.
 *
 * **Structure** (matches Rust `PeginTx`):
 * - Input: Dummy coinbase-like input (allows transaction serialization without real funding)
 * - Output: P2TR output to vault address (depositor + vault provider + vault keepers + universal challengers script)
 *
 * In production, the pegin transaction is funded by the depositor's wallet and
 * creates the vault output that must be signed by depositor + VP + all vault keepers.
 *
 * @returns Transaction hex string
 * @see Rust: crates/vault/src/transactions/pegin.rs::PeginTx
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
 * Creates a test claim transaction (simplified structure).
 *
 * **Production Structure** (Rust `ClaimTx`):
 * - Spends PegIn output
 * - Creates 2 outputs:
 *   - Output 0: ClaimPayoutNoPayoutConnector (timelock path)
 *   - Output 1: ClaimPayoutNoProofConnector (multisig path)
 *
 * **Test Simplification**:
 * - Single dummy output representing a claimable UTXO
 * - Used to test multi-input payout PSBT construction
 *
 * @returns Transaction hex string
 * @see Rust: crates/vault/src/transactions/claim.rs::ClaimTx
 */
function createTestClaimTransaction(): string {
  const tx = new Transaction();

  // Dummy input (distinct from pegin using DUMMY_TXID_1)
  tx.addInput(DUMMY_TXID_1, 0xffffffff, SEQUENCE_MAX);

  // P2WPKH dummy output (filled with 'b' for identification)
  tx.addOutput(createDummyP2WPKH("b"), Number(TEST_CLAIM_VALUE));

  return tx.toHex();
}

/**
 * Creates a payout transaction that spends from pegin and claim.
 *
 * **Production Structure** (Rust `PayoutTx::new()`):
 * - Input 0: PegIn output (depositor signs via Taproot script path)
 * - Input 1: Claim output 0 (claimer + vault keepers sign, timelock)
 * - Input 2: Claim output 1 (claimer + vault keepers sign, multisig)
 * - Output 0: Payment to recipient
 * - Output 1: Claimer compensation
 *
 * **Test Structure** (simplified for testing):
 * - 2 inputs (pegin + claim) - REQUIRED because Taproot SIGHASH_DEFAULT commits to ALL prevouts
 * - 1 output (recipient payment)
 *
 * @param peginTxHex - Hex of pegin transaction to spend from
 * @param claimTxHex - Hex of claim transaction to spend from
 * @returns Transaction hex string
 * @see Rust: crates/vault/src/transactions/payout.rs::PayoutTx::new()
 */
function createTestPayoutTransaction(
  peginTxHex: string,
  claimTxHex: string,
): string {
  const peginTx = Transaction.fromHex(peginTxHex);
  const claimTx = Transaction.fromHex(claimTxHex);
  const tx = new Transaction();

  // Input 0: Spend from pegin output (depositor must sign this)
  tx.addInput(Buffer.from(peginTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);

  // Input 1: Spend from claim output (claimer + vault keepers sign)
  // REQUIRED: Taproot SIGHASH_DEFAULT commits to ALL inputs' prevouts
  tx.addInput(Buffer.from(claimTx.getId(), "hex").reverse(), 0, SEQUENCE_MAX);

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
    it("should build a valid payout PSBT with both inputs for correct sighash", async () => {
      // Create test transactions:
      // - PegIn: Contains vault output that depositor can sign
      // - Claim: Claim output from claimer
      // - Payout: Spends both pegin and claim outputs (required for correct sighash)
      //
      // IMPORTANT: For Taproot SIGHASH_DEFAULT, the sighash commits to ALL inputs' prevouts.
      // Therefore, both inputs must be in the PSBT even though only input 0 is signed.
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, claimTxHex);

      const params: PayoutParams = {
        payoutTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
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

    it("should include both inputs for SIGHASH_DEFAULT compatibility", async () => {
      // Create test transactions:
      // - PegIn: Vault output from depositor
      // - Claim: Claim output from claimer
      // - Payout: Spends both pegin and claim outputs
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, claimTxHex);

      const params: PayoutParams = {
        payoutTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        network: "signet" as Network,
      };

      const result = await buildPayoutPsbt(params);

      // Verify PSBT structure - BOTH inputs must be included for correct sighash
      // Taproot SIGHASH_DEFAULT commits to ALL inputs' prevouts
      const psbt = Psbt.fromHex(result.psbtHex);
      expect(psbt.data.inputs.length).toBe(2);
      expect(psbt.data.outputs.length).toBe(1);

      // Verify input 0 (depositor) has Taproot info for signing
      const firstInput = psbt.data.inputs[0];
      expect(firstInput.tapLeafScript).toBeDefined();
      expect(firstInput.tapInternalKey).toBeDefined();
      expect(firstInput.witnessUtxo).toBeDefined();

      // Verify input 1 (claim) has witnessUtxo but NOT tapLeafScript
      const secondInput = psbt.data.inputs[1];
      expect(secondInput.witnessUtxo).toBeDefined();
      expect(secondInput.tapLeafScript).toBeUndefined();
    });

    it("should handle different networks", async () => {
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, claimTxHex);

      const networks: Network[] = ["testnet", "regtest"];

      for (const network of networks) {
        const params: PayoutParams = {
          payoutTxHex,
          peginTxHex,
          claimTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
          universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
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
      const claimTxHex = createTestClaimTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, claimTxHex);

      // Parse the payout transaction to check its version
      const payoutTx = Transaction.fromHex(payoutTxHex);

      const params: PayoutParams = {
        payoutTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
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
    it("should throw error when payout transaction has fewer than 2 inputs", async () => {
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();

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
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        network: "signet" as Network,
      };

      await expect(buildPayoutPsbt(params)).rejects.toThrow(
        /must have exactly 2 inputs/,
      );
    });

    it("should throw error when previous output not found", async () => {
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const claimTx = Transaction.fromHex(claimTxHex);

      // Create a payout transaction that references an invalid output index for pegin
      const peginTx = Transaction.fromHex(peginTxHex);
      const wrongTx = new Transaction();
      wrongTx.addInput(
        Buffer.from(peginTx.getId(), "hex").reverse(),
        99,
        SEQUENCE_MAX,
      ); // Invalid index 99
      wrongTx.addInput(
        Buffer.from(claimTx.getId(), "hex").reverse(),
        0,
        SEQUENCE_MAX,
      );
      wrongTx.addOutput(createDummyP2WPKH("f"), Number(TEST_PAYOUT_VALUE));
      const payoutTxHex = wrongTx.toHex();

      const params: PayoutParams = {
        payoutTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        network: "signet" as Network,
      };

      await expect(buildPayoutPsbt(params)).rejects.toThrow(
        /Previous output not found/,
      );
    });
  });

  describe("Integration with WASM", () => {
    it("should successfully use WASM-generated payout script", async () => {
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutTxHex = createTestPayoutTransaction(peginTxHex, claimTxHex);

      const params: PayoutParams = {
        payoutTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
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
      ).toThrow(/No inputs found in signed PSBT/);
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
      ).toThrow(/No tapScriptSig found/);
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

    it("should extract 64-byte signature from 65-byte signature (strip sighash)", () => {
      // Some wallets append a sighash flag byte (0x01) to Schnorr signatures
      // We need to strip this to get the pure 64-byte signature
      const signature65 = Buffer.alloc(65);
      signature65.fill(0xbb, 0, 64); // Fill first 64 bytes
      signature65[64] = 0x01; // Sighash flag (SIGHASH_ALL)

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
      const extracted = extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR);

      expect(extracted).toBe(signature65.subarray(0, 64).toString("hex"));
      expect(extracted.length).toBe(128); // 64 bytes = 128 hex chars
      expect(extracted).not.toContain("01"); // No sighash flag at the end
    });

    it("should find correct signature when multiple signatures present", () => {
      // In multi-sig scenarios, tapScriptSig may contain signatures from multiple parties
      // We need to find the depositor's specific signature
      const depositorSig = Buffer.alloc(64, 0xcc);
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
            pubkey: Buffer.from(TEST_KEYS.VAULT_PROVIDER, "hex"),
            signature: otherSig,
            leafHash: Buffer.alloc(32, 0),
          },
          {
            pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
            signature: depositorSig,
            leafHash: Buffer.alloc(32, 0),
          },
        ],
      });

      const psbtHex = psbt.toHex();
      const extracted = extractPayoutSignature(psbtHex, TEST_KEYS.DEPOSITOR);

      expect(extracted).toBe(depositorSig.toString("hex"));
      expect(extracted).not.toBe(otherSig.toString("hex"));
    });
  });

});
