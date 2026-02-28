/**
 * Tests for buildPayoutOptimisticPsbt, buildPayoutPsbt, and extractPayoutSignature primitive functions
 *
 * These tests verify the PSBT building and signature extraction logic for payout
 * transactions in the Babylon vault protocol.
 */

import { Buffer } from "buffer";

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildPayoutOptimisticPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
  type PayoutOptimisticParams,
  type PayoutParams,
} from "../payout";
import {
  DUMMY_TXID_1,
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
 * Creates a test claim transaction (simplified for testing).
 * Single dummy output used to test multi-input PayoutOptimistic PSBT construction.
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
 * Creates a PayoutOptimistic transaction (simplified for testing).
 * 2 inputs (pegin + claim) required because Taproot SIGHASH_DEFAULT commits to all prevouts.
 */
function createTestPayoutOptimisticTransaction(
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

describe("buildPayoutOptimisticPsbt", () => {
  // Initialize WASM before running tests
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Basic functionality", () => {
    it("should build a valid PayoutOptimistic PSBT with both inputs for correct sighash", async () => {
      // Create test transactions:
      // - PegIn: Contains vault output that depositor can sign
      // - Claim: Claim output from claimer (optimistic path)
      // - PayoutOptimistic: Spends both pegin and claim outputs (required for correct sighash)
      //
      // IMPORTANT: For Taproot SIGHASH_DEFAULT, the sighash commits to ALL inputs' prevouts.
      // Therefore, both inputs must be in the PSBT even though only input 0 is signed.
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutOptimisticTxHex = createTestPayoutOptimisticTransaction(
        peginTxHex,
        claimTxHex,
      );

      const params: PayoutOptimisticParams = {
        payoutOptimisticTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
      };

      const result = await buildPayoutOptimisticPsbt(params);

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
      const claimTxHex = createTestClaimTransaction();
      const payoutOptimisticTxHex = createTestPayoutOptimisticTransaction(
        peginTxHex,
        claimTxHex,
      );

      const networks: Network[] = ["testnet", "regtest"];

      for (const network of networks) {
        const params: PayoutOptimisticParams = {
          payoutOptimisticTxHex,
          peginTxHex,
          claimTxHex,
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
          vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
          universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
          timelockPegin: 100,
          network,
        };

        const result = await buildPayoutOptimisticPsbt(params);
        expect(result.psbtHex).toBeTruthy();

        const psbt = Psbt.fromHex(result.psbtHex);
        expect(psbt.data.inputs.length).toBe(2);
      }
    });
  });

  describe("Error handling", () => {
    it("should throw error when PayoutOptimistic transaction has fewer than 2 inputs", async () => {
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
      const payoutOptimisticTxHex = wrongTx.toHex();

      const params: PayoutOptimisticParams = {
        payoutOptimisticTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
      };

      await expect(buildPayoutOptimisticPsbt(params)).rejects.toThrow(
        /must have exactly 2 inputs/,
      );
    });
  });

  describe("Integration with WASM", () => {
    it("should successfully use WASM-generated payout script", async () => {
      const peginTxHex = createTestPeginTransaction();
      const claimTxHex = createTestClaimTransaction();
      const payoutOptimisticTxHex = createTestPayoutOptimisticTransaction(
        peginTxHex,
        claimTxHex,
      );

      const params: PayoutOptimisticParams = {
        payoutOptimisticTxHex,
        peginTxHex,
        claimTxHex,
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        timelockPegin: 100,
        network: "signet" as Network,
      };

      const result = await buildPayoutOptimisticPsbt(params);
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

describe("buildPayoutPsbt (challenge path)", () => {
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

    it("should throw error when previous output not found", async () => {
      const peginTxHex = createTestPeginTransaction();
      const assertTxHex = createTestAssertTransaction();
      const assertTx = Transaction.fromHex(assertTxHex);

      // Create a payout transaction that references an invalid output index for pegin
      const peginTx = Transaction.fromHex(peginTxHex);
      const wrongTx = new Transaction();
      wrongTx.addInput(
        Buffer.from(peginTx.getId(), "hex").reverse(),
        99,
        SEQUENCE_MAX,
      ); // Invalid index 99
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
        /Previous output not found/,
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

      // Should strip the sighash flag and return only 64 bytes
      const expected64 = Buffer.alloc(64, 0xbb).toString("hex");
      expect(extracted).toBe(expected64);
      expect(extracted.length).toBe(128); // 64 bytes = 128 hex chars
    });
  });
});
