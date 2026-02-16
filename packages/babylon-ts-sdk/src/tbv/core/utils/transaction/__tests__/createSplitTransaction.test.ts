/**
 * Tests for UTXO split transaction builder
 */

import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import type { UTXO } from "../../utxo/selectUtxos";
import {
  createSplitTransaction,
  createSplitTransactionPsbt,
  type SplitOutput,
} from "../createSplitTransaction";

describe("createSplitTransaction", () => {
  // Mock UTXOs for testing
  const mockUTXO1: UTXO = {
    txid: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
    vout: 0,
    value: 100000, // 0.001 BTC
    scriptPubKey:
      "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  };

  const mockUTXO2: UTXO = {
    txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    vout: 1,
    value: 70000,
    scriptPubKey:
      "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
  };

  // Testnet addresses for testing (P2WPKH format for bitcoinjs-lib compatibility)
  // Note: In production, vault system requires P2TR addresses, but these tests
  // focus on transaction construction mechanics, not address type validation.
  const testnetAddress1 = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
  const testnetAddress2 = "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7";

  describe("Basic Functionality", () => {
    it("should create split transaction with 2 outputs", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
        { amount: 45000n, address: testnetAddress2 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");

      expect(result).toBeTruthy();
      expect(result.txHex).toBeTruthy();
      expect(typeof result.txHex).toBe("string");
      expect(result.txid).toBeTruthy();
      expect(typeof result.txid).toBe("string");
      expect(result.outputs).toHaveLength(2);

      // Verify transaction structure
      const tx = bitcoin.Transaction.fromHex(result.txHex);
      expect(tx.ins.length).toBe(1);
      expect(tx.outs.length).toBe(2);
      expect(tx.outs[0].value).toBe(50000);
      expect(tx.outs[1].value).toBe(45000);
    });

    it("should create split transaction with multiple inputs", () => {
      const outputs: SplitOutput[] = [
        { amount: 80000n, address: testnetAddress1 },
        { amount: 85000n, address: testnetAddress2 },
      ];

      const result = createSplitTransaction(
        [mockUTXO1, mockUTXO2],
        outputs,
        "testnet",
      );

      const tx = bitcoin.Transaction.fromHex(result.txHex);
      expect(tx.ins.length).toBe(2);
      expect(tx.outs.length).toBe(2);
    });

    it("should return deterministic txid", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
        { amount: 45000n, address: testnetAddress2 },
      ];

      const result1 = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const result2 = createSplitTransaction([mockUTXO1], outputs, "testnet");

      // Same inputs/outputs should produce same txid
      expect(result1.txid).toBe(result2.txid);
      expect(result1.txHex).toBe(result2.txHex);
    });

    it("should preserve transaction version 2", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.version).toBe(2);
    });

    it("should include all output UTXO references", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
        { amount: 45000n, address: testnetAddress2 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");

      expect(result.outputs).toHaveLength(2);

      // First output
      expect(result.outputs[0].txid).toBe(result.txid);
      expect(result.outputs[0].vout).toBe(0);
      expect(result.outputs[0].value).toBe(50000);
      expect(result.outputs[0].scriptPubKey).toBeTruthy();

      // Second output
      expect(result.outputs[1].txid).toBe(result.txid);
      expect(result.outputs[1].vout).toBe(1);
      expect(result.outputs[1].value).toBe(45000);
      expect(result.outputs[1].scriptPubKey).toBeTruthy();
    });
  });

  describe("Transaction Structure Validation", () => {
    it("should reverse input txids for Bitcoin byte order", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      // The input hash should be reversed from the original txid
      const inputTxid = tx.ins[0].hash.reverse().toString("hex");
      expect(inputTxid).toBe(mockUTXO1.txid);
    });

    it("should decode addresses to scriptPubKey correctly", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");

      // scriptPubKey should be a hex string
      expect(result.outputs[0].scriptPubKey).toMatch(/^[0-9a-f]+$/);
      expect(result.outputs[0].scriptPubKey.length).toBeGreaterThan(0);
    });

    it("should set correct output indices (vout)", () => {
      const outputs: SplitOutput[] = [
        { amount: 30000n, address: testnetAddress1 },
        { amount: 30000n, address: testnetAddress1 },
        { amount: 30000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");

      expect(result.outputs[0].vout).toBe(0);
      expect(result.outputs[1].vout).toBe(1);
      expect(result.outputs[2].vout).toBe(2);
    });

    it("should match output amounts exactly", () => {
      const outputs: SplitOutput[] = [
        { amount: 12345n, address: testnetAddress1 },
        { amount: 67890n, address: testnetAddress2 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.outs[0].value).toBe(12345);
      expect(tx.outs[1].value).toBe(67890);
    });
  });

  describe("Network Support", () => {
    it("should work with testnet addresses", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      expect(result.txHex).toBeTruthy();

      const tx = bitcoin.Transaction.fromHex(result.txHex);
      expect(tx.outs.length).toBe(1);
    });

    it("should work with bitcoin (mainnet) network", () => {
      const mainnetAddress = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: mainnetAddress },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "bitcoin");
      expect(result.txHex).toBeTruthy();
    });

    it("should work with signet network (uses testnet)", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "signet");
      expect(result.txHex).toBeTruthy();
    });
  });

  describe("Error Handling", () => {
    it("should throw error for empty inputs array", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      expect(() => createSplitTransaction([], outputs, "testnet")).toThrow(
        "No input UTXOs provided for split transaction",
      );
    });

    it("should throw error for empty outputs array", () => {
      expect(() => createSplitTransaction([mockUTXO1], [], "testnet")).toThrow(
        "No outputs specified for split transaction",
      );
    });

    it("should throw error for zero output amount", () => {
      const outputs: SplitOutput[] = [
        { amount: 0n, address: testnetAddress1 },
      ];

      expect(() =>
        createSplitTransaction([mockUTXO1], outputs, "testnet"),
      ).toThrow(/Invalid output amount.*0 satoshis.*must be greater than zero/);
    });

    it("should throw error for negative output amount", () => {
      const outputs: SplitOutput[] = [
        { amount: -1000n, address: testnetAddress1 },
      ];

      expect(() =>
        createSplitTransaction([mockUTXO1], outputs, "testnet"),
      ).toThrow(/Invalid output amount.*-1000 satoshis.*must be greater than zero/);
    });

    it("should throw error for invalid address", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: "invalid_address" },
      ];

      expect(() =>
        createSplitTransaction([mockUTXO1], outputs, "testnet"),
      ).toThrow(/Failed to decode address/);
    });

    it("should throw error for address/network mismatch", () => {
      // Using testnet address with mainnet network
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      expect(() =>
        createSplitTransaction([mockUTXO1], outputs, "bitcoin"),
      ).toThrow(/Failed to decode address/);
    });

    it("should throw error for unknown network", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress1 },
      ];

      expect(() =>
        createSplitTransaction(
          [mockUTXO1],
          outputs,
          "unknown" as any,
        ),
      ).toThrow("Unknown network");
    });
  });

  describe("Edge Cases", () => {
    it("should handle single input, single output", () => {
      const outputs: SplitOutput[] = [
        { amount: 95000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.ins.length).toBe(1);
      expect(tx.outs.length).toBe(1);
    });

    it("should handle single input, multiple outputs", () => {
      const outputs: SplitOutput[] = [
        { amount: 25000n, address: testnetAddress1 },
        { amount: 25000n, address: testnetAddress1 },
        { amount: 25000n, address: testnetAddress1 },
        { amount: 20000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.ins.length).toBe(1);
      expect(tx.outs.length).toBe(4);
    });

    it("should handle multiple inputs, single output", () => {
      const outputs: SplitOutput[] = [
        { amount: 165000n, address: testnetAddress1 },
      ];

      const result = createSplitTransaction(
        [mockUTXO1, mockUTXO2],
        outputs,
        "testnet",
      );
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.ins.length).toBe(2);
      expect(tx.outs.length).toBe(1);
    });

    it("should handle large amounts", () => {
      const largeUTXO: UTXO = {
        ...mockUTXO1,
        value: 100000000, // 1 BTC
      };

      const outputs: SplitOutput[] = [
        { amount: 50000000n, address: testnetAddress1 }, // 0.5 BTC
        { amount: 49000000n, address: testnetAddress2 }, // 0.49 BTC
      ];

      const result = createSplitTransaction([largeUTXO], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.outs[0].value).toBe(50000000);
      expect(tx.outs[1].value).toBe(49000000);
    });

    it("should handle dust-level amounts", () => {
      const outputs: SplitOutput[] = [
        { amount: 546n, address: testnetAddress1 }, // Dust threshold
        { amount: 600n, address: testnetAddress2 }, // Just above dust
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.outs[0].value).toBe(546);
      expect(tx.outs[1].value).toBe(600);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should split 1 BTC into 0.5 + 0.5", () => {
      const oneBtcUTXO: UTXO = {
        ...mockUTXO1,
        value: 100000000, // 1 BTC
      };

      const outputs: SplitOutput[] = [
        { amount: 50000000n, address: testnetAddress1 }, // 0.5 BTC
        { amount: 50000000n, address: testnetAddress2 }, // 0.5 BTC
      ];

      const result = createSplitTransaction([oneBtcUTXO], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.outs[0].value).toBe(50000000);
      expect(tx.outs[1].value).toBe(50000000);
    });

    it("should split 0.7 + 0.3 into 1.0 output", () => {
      const utxo1: UTXO = { ...mockUTXO1, value: 70000000 }; // 0.7 BTC
      const utxo2: UTXO = { ...mockUTXO2, value: 30000000 }; // 0.3 BTC

      const outputs: SplitOutput[] = [
        { amount: 100000000n, address: testnetAddress1 }, // 1.0 BTC
      ];

      const result = createSplitTransaction([utxo1, utxo2], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.ins.length).toBe(2);
      expect(tx.outs[0].value).toBe(100000000);
    });

    it("should handle fee-adjusted outputs", () => {
      const outputs: SplitOutput[] = [
        // Outputs include fee buffer for subsequent pegin transactions
        { amount: 50005000n, address: testnetAddress1 }, // 0.5 BTC + 5000 sats fee buffer
        { amount: 45005000n, address: testnetAddress2 }, // 0.45 BTC + 5000 sats fee buffer
      ];

      const result = createSplitTransaction([mockUTXO1], outputs, "testnet");
      const tx = bitcoin.Transaction.fromHex(result.txHex);

      expect(tx.outs[0].value).toBe(50005000);
      expect(tx.outs[1].value).toBe(45005000);
    });
  });
});

describe("createSplitTransactionPsbt", () => {
  const mockUTXO: UTXO = {
    txid: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
    vout: 0,
    value: 100000,
    scriptPubKey:
      "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  };

  const testnetAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

  // Mock x-only public key (32 bytes)
  const mockPubkey = Buffer.from(
    "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "hex",
  );

  describe("Basic Functionality", () => {
    it("should create valid PSBT from unsigned transaction", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
        { amount: 45000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      expect(psbtHex).toBeTruthy();
      expect(typeof psbtHex).toBe("string");

      // Should be able to parse as PSBT
      const psbt = bitcoin.Psbt.fromHex(psbtHex);
      expect(psbt).toBeTruthy();
    });

    it("should preserve version and locktime", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      // Parse the global transaction from PSBT data
      const globalTx = psbt.data.globalMap.unsignedTx;
      expect(globalTx).toBeTruthy();

      const tx = bitcoin.Transaction.fromBuffer(globalTx.toBuffer());
      expect(tx.version).toBe(2);
      expect(tx.locktime).toBe(0);
    });

    it("should add witnessUtxo for each input", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      // PSBT should have input data
      expect(psbt.data.inputs.length).toBe(1);
      expect(psbt.data.inputs[0].witnessUtxo).toBeTruthy();
      expect(psbt.data.inputs[0].witnessUtxo?.value).toBe(mockUTXO.value);
    });

    it("should add tapInternalKey for each input", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      expect(psbt.data.inputs[0].tapInternalKey).toBeTruthy();
      expect(psbt.data.inputs[0].tapInternalKey?.toString("hex")).toBe(
        mockPubkey.toString("hex"),
      );
    });

    it("should include all outputs", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
        { amount: 45000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      // Get transaction from PSBT global data
      const globalTx = psbt.data.globalMap.unsignedTx;
      const tx = bitcoin.Transaction.fromBuffer(globalTx.toBuffer());

      expect(tx.outs.length).toBe(2);
      expect(tx.outs[0].value).toBe(50000);
      expect(tx.outs[1].value).toBe(45000);
    });
  });

  describe("Input/Output Validation", () => {
    it("should match number of inputs", () => {
      const mockUTXO2: UTXO = {
        txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        vout: 1,
        value: 70000,
        scriptPubKey:
          "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      };

      const outputs: SplitOutput[] = [
        { amount: 165000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO, mockUTXO2],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO, mockUTXO2],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);
      expect(psbt.data.inputs.length).toBe(2);
    });

    it("should preserve output scripts", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      // Get transaction from PSBT global data
      const globalTx = psbt.data.globalMap.unsignedTx;
      const tx = bitcoin.Transaction.fromBuffer(globalTx.toBuffer());

      // Script should match the decoded address
      const expectedScript = bitcoin.address.toOutputScript(
        testnetAddress,
        bitcoin.networks.testnet,
      );
      expect(tx.outs[0].script.toString("hex")).toBe(
        expectedScript.toString("hex"),
      );
    });

    it("should preserve output values", () => {
      const outputs: SplitOutput[] = [
        { amount: 12345n, address: testnetAddress },
        { amount: 67890n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      // Get transaction from PSBT global data
      const globalTx = psbt.data.globalMap.unsignedTx;
      const tx = bitcoin.Transaction.fromBuffer(globalTx.toBuffer());

      expect(tx.outs[0].value).toBe(12345);
      expect(tx.outs[1].value).toBe(67890);
    });
  });

  describe("Error Handling", () => {
    it("should throw error when UTXO data missing for input", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );

      // Pass empty UTXO array (missing data)
      expect(() =>
        createSplitTransactionPsbt(splitResult.txHex, [], mockPubkey),
      ).toThrow(/UTXO count mismatch.*1 input.*0 UTXOs/);
    });

    it("should throw error for mismatched input counts", () => {
      const mockUTXO2: UTXO = {
        txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        vout: 1,
        value: 70000,
        scriptPubKey:
          "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      };

      const outputs: SplitOutput[] = [
        { amount: 165000n, address: testnetAddress },
      ];

      // Create tx with 2 inputs
      const splitResult = createSplitTransaction(
        [mockUTXO, mockUTXO2],
        outputs,
        "testnet",
      );

      // But only provide 1 UTXO
      expect(() =>
        createSplitTransactionPsbt(splitResult.txHex, [mockUTXO], mockPubkey),
      ).toThrow(/UTXO count mismatch.*2 inputs.*1 UTXO/);
    });

    it("should throw error for non-P2TR input in PSBT", () => {
      // Create transaction with P2TR output
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );

      // Try to create PSBT with P2WPKH input (wrong type)
      const p2wpkhUTXO: UTXO = {
        ...mockUTXO,
        scriptPubKey: "0014751e76e8199196d454941c45d1b3a323f1433bd6", // P2WPKH
      };

      expect(() =>
        createSplitTransactionPsbt(
          splitResult.txHex,
          [p2wpkhUTXO],
          mockPubkey,
        ),
      ).toThrow(/must be P2TR/);
    });

    it("should throw error for too many UTXOs", () => {
      // Create transaction with 1 input
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );

      // Create a second mock UTXO for testing
      const mockUTXO2: UTXO = {
        txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        vout: 1,
        value: 70000,
        scriptPubKey:
          "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      };

      // Try to create PSBT with 2 UTXOs (too many)
      expect(() =>
        createSplitTransactionPsbt(
          splitResult.txHex,
          [mockUTXO, mockUTXO2],
          mockPubkey,
        ),
      ).toThrow(/UTXO count mismatch.*1 input.*2 UTXOs/);
    });

    it("should throw error for invalid publicKeyNoCoord length", () => {
      // Create valid transaction
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );

      // Test with 31-byte key (too short)
      const invalidKey31 = Buffer.alloc(31, 0xaa);
      expect(() =>
        createSplitTransactionPsbt(
          splitResult.txHex,
          [mockUTXO],
          invalidKey31,
        ),
      ).toThrow(/Invalid publicKeyNoCoord.*expected 32-byte/);

      // Test with 33-byte key (too long)
      const invalidKey33 = Buffer.alloc(33, 0xaa);
      expect(() =>
        createSplitTransactionPsbt(
          splitResult.txHex,
          [mockUTXO],
          invalidKey33,
        ),
      ).toThrow(/Invalid publicKeyNoCoord.*expected 32-byte/);
    });

    it("should throw error for UTXO outpoint mismatch", () => {
      const outputs: SplitOutput[] = [{ amount: 50000n, address: testnetAddress }];
      const splitResult = createSplitTransaction([mockUTXO], outputs, "testnet");

      // Create a UTXO with different outpoint
      const wrongUTXO: UTXO = {
        txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        vout: 99,
        value: mockUTXO.value,
        scriptPubKey: mockUTXO.scriptPubKey,
      };

      expect(() =>
        createSplitTransactionPsbt(splitResult.txHex, [wrongUTXO], mockPubkey),
      ).toThrow(/Input 0 outpoint mismatch.*transaction expects.*but UTXO.*was provided/);
    });
  });

  describe("Integration", () => {
    it("should work with result from createSplitTransaction()", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
        { amount: 45000n, address: testnetAddress },
      ];

      // Create split transaction
      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );

      // Create PSBT from it
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      // Should be able to parse PSBT
      const psbt = bitcoin.Psbt.fromHex(psbtHex);
      expect(psbt.data.inputs.length).toBe(1);
      expect(psbt.data.outputs.length).toBe(2);
    });

    it("should produce PSBT that can be parsed by bitcoinjs-lib", () => {
      const outputs: SplitOutput[] = [
        { amount: 50000n, address: testnetAddress },
      ];

      const splitResult = createSplitTransaction(
        [mockUTXO],
        outputs,
        "testnet",
      );
      const psbtHex = createSplitTransactionPsbt(
        splitResult.txHex,
        [mockUTXO],
        mockPubkey,
      );

      // Should not throw when parsing PSBT
      expect(() => bitcoin.Psbt.fromHex(psbtHex)).not.toThrow();

      const psbt = bitcoin.Psbt.fromHex(psbtHex);

      // Should be able to access unsigned transaction from PSBT data
      expect(psbt.data.globalMap.unsignedTx).toBeTruthy();

      const globalTx = psbt.data.globalMap.unsignedTx;
      const tx = bitcoin.Transaction.fromBuffer(globalTx.toBuffer());

      // Verify transaction properties
      expect(tx.version).toBe(2);
      expect(tx.ins.length).toBe(1);
      expect(tx.outs.length).toBe(1);
    });
  });
});

describe("Integration Tests", () => {
  it("should maintain deterministic txid across createSplitTransaction calls", () => {
    const mockUTXO: UTXO = {
      txid: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
      vout: 0,
      value: 100000,
      scriptPubKey:
        "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    };

    const testnetAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
    const outputs: SplitOutput[] = [
      { amount: 50000n, address: testnetAddress },
      { amount: 45000n, address: testnetAddress },
    ];

    const result1 = createSplitTransaction([mockUTXO], outputs, "testnet");
    const result2 = createSplitTransaction([mockUTXO], outputs, "testnet");
    const result3 = createSplitTransaction([mockUTXO], outputs, "testnet");

    // All should produce identical txids
    expect(result1.txid).toBe(result2.txid);
    expect(result2.txid).toBe(result3.txid);

    // Output UTXO references should also be identical
    expect(result1.outputs[0].txid).toBe(result2.outputs[0].txid);
    expect(result1.outputs[0].vout).toBe(result2.outputs[0].vout);
    expect(result1.outputs[0].value).toBe(result2.outputs[0].value);
  });

  it("should produce outputs that can be used as inputs", () => {
    const mockUTXO: UTXO = {
      txid: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
      vout: 0,
      value: 100000,
      scriptPubKey:
        "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    };

    const testnetAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
    const outputs: SplitOutput[] = [
      { amount: 50000n, address: testnetAddress },
      { amount: 45000n, address: testnetAddress },
    ];

    // Create split transaction
    const result = createSplitTransaction([mockUTXO], outputs, "testnet");

    // Output UTXOs should have all fields needed to be used as inputs
    const output1 = result.outputs[0];
    expect(output1.txid).toBeTruthy();
    expect(typeof output1.txid).toBe("string");
    expect(output1.txid.length).toBe(64); // 64 hex chars
    expect(typeof output1.vout).toBe("number");
    expect(typeof output1.value).toBe("number");
    expect(output1.scriptPubKey).toBeTruthy();
    expect(typeof output1.scriptPubKey).toBe("string");

    // These outputs can now be used as input UTXOs for another transaction
    const newUTXO: UTXO = {
      txid: output1.txid,
      vout: output1.vout,
      value: output1.value,
      scriptPubKey: output1.scriptPubKey,
    };

    // Should be valid UTXO structure
    expect(newUTXO.txid).toBe(result.txid);
    expect(newUTXO.vout).toBe(0);
    expect(newUTXO.value).toBe(50000);
  });
});
