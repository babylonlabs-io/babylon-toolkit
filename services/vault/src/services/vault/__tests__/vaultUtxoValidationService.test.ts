/** Tests for UTXO validation service. */

import { getAddressUtxos } from "@babylonlabs-io/ts-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertUtxosAvailable,
  extractInputsFromTransaction,
  UtxoNotAvailableError,
  validateUtxosAvailable,
} from "../vaultUtxoValidationService";

// Mock the mempool API
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  getAddressUtxos: vi.fn(),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.space/api"),
}));

const mockedGetAddressUtxos = vi.mocked(getAddressUtxos);

// Valid transaction hex with single input (txid: aaa..., vout: 3)
const VALID_TX_SINGLE_INPUT =
  "0100000001" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" + // prev txid (LE)
  "03000000" + // prev vout = 3 (LE)
  "6b" +
  "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" +
  "ffffffff" +
  "01" +
  "605af40500000000" +
  "19" +
  "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" +
  "00000000";

// Helper to create a valid transaction hex with multiple inputs
function createMultiInputTxHex(
  inputs: Array<{ txidLE: string; vout: number }>,
): string {
  const inputCount = inputs.length.toString(16).padStart(2, "0");
  let inputsHex = "";

  for (const input of inputs) {
    const voutHex = input.vout.toString(16).padStart(8, "0");
    const voutLE =
      voutHex.slice(6, 8) +
      voutHex.slice(4, 6) +
      voutHex.slice(2, 4) +
      voutHex.slice(0, 2);

    inputsHex +=
      input.txidLE +
      voutLE +
      "6b" +
      "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" +
      "ffffffff";
  }

  return (
    "01000000" +
    inputCount +
    inputsHex +
    "01" +
    "605af40500000000" +
    "19" +
    "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" +
    "00000000"
  );
}

describe("vaultUtxoValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractInputsFromTransaction", () => {
    it("should extract inputs from valid transaction hex", () => {
      const inputs = extractInputsFromTransaction(VALID_TX_SINGLE_INPUT);

      expect(inputs).toHaveLength(1);
      // txid is stored in little-endian, so we reverse to get big-endian
      expect(inputs[0].txid).toBe(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(inputs[0].vout).toBe(3);
    });

    it("should handle 0x-prefixed transaction hex", () => {
      const inputs = extractInputsFromTransaction("0x" + VALID_TX_SINGLE_INPUT);

      expect(inputs).toHaveLength(1);
      expect(inputs[0].txid).toBe(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(inputs[0].vout).toBe(3);
    });

    it("should extract multiple inputs from multi-input transaction", () => {
      const multiInputTx = createMultiInputTxHex([
        {
          txidLE:
            "1111111111111111111111111111111111111111111111111111111111111111",
          vout: 0,
        },
        {
          txidLE:
            "2222222222222222222222222222222222222222222222222222222222222222",
          vout: 5,
        },
        {
          txidLE:
            "3333333333333333333333333333333333333333333333333333333333333333",
          vout: 10,
        },
      ]);

      const inputs = extractInputsFromTransaction(multiInputTx);

      expect(inputs).toHaveLength(3);
      expect(inputs[0].txid).toBe(
        "1111111111111111111111111111111111111111111111111111111111111111",
      );
      expect(inputs[0].vout).toBe(0);
      expect(inputs[1].txid).toBe(
        "2222222222222222222222222222222222222222222222222222222222222222",
      );
      expect(inputs[1].vout).toBe(5);
      expect(inputs[2].txid).toBe(
        "3333333333333333333333333333333333333333333333333333333333333333",
      );
      expect(inputs[2].vout).toBe(10);
    });

    it("should throw clear error for invalid transaction hex", () => {
      expect(() => extractInputsFromTransaction("invalid-hex")).toThrow(
        "Failed to parse unsigned BTC transaction",
      );
    });

    it("should throw clear error for empty string", () => {
      expect(() => extractInputsFromTransaction("")).toThrow(
        "Failed to parse unsigned BTC transaction",
      );
    });

    it("should throw clear error for truncated hex", () => {
      expect(() => extractInputsFromTransaction("01000000")).toThrow(
        "Failed to parse unsigned BTC transaction",
      );
    });
  });

  describe("validateUtxosAvailable", () => {
    const TEST_ADDRESS = "bc1qtest...";

    it("should return allAvailable: true when all UTXOs exist", async () => {
      mockedGetAddressUtxos.mockResolvedValue([
        {
          txid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          vout: 3,
          value: 100000,
          scriptPubKey: "script",
          confirmed: true,
        },
      ]);

      const result = await validateUtxosAvailable(
        VALID_TX_SINGLE_INPUT,
        TEST_ADDRESS,
      );

      expect(result.allAvailable).toBe(true);
      expect(result.missingUtxos).toHaveLength(0);
      expect(result.totalInputs).toBe(1);
    });

    it("should return allAvailable: false when UTXO is missing", async () => {
      // Return empty UTXOs - the required UTXO is not available
      mockedGetAddressUtxos.mockResolvedValue([]);

      const result = await validateUtxosAvailable(
        VALID_TX_SINGLE_INPUT,
        TEST_ADDRESS,
      );

      expect(result.allAvailable).toBe(false);
      expect(result.missingUtxos).toHaveLength(1);
      expect(result.missingUtxos[0].txid).toBe(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(result.missingUtxos[0].vout).toBe(3);
    });

    it("should detect multiple missing UTXOs", async () => {
      const multiInputTx = createMultiInputTxHex([
        {
          txidLE:
            "1111111111111111111111111111111111111111111111111111111111111111",
          vout: 0,
        },
        {
          txidLE:
            "2222222222222222222222222222222222222222222222222222222222222222",
          vout: 1,
        },
      ]);

      // Only one of the required UTXOs is available
      mockedGetAddressUtxos.mockResolvedValue([
        {
          txid: "1111111111111111111111111111111111111111111111111111111111111111",
          vout: 0,
          value: 50000,
          scriptPubKey: "script",
          confirmed: true,
        },
      ]);

      const result = await validateUtxosAvailable(multiInputTx, TEST_ADDRESS);

      expect(result.allAvailable).toBe(false);
      expect(result.missingUtxos).toHaveLength(1);
      expect(result.missingUtxos[0].txid).toBe(
        "2222222222222222222222222222222222222222222222222222222222222222",
      );
      expect(result.missingUtxos[0].vout).toBe(1);
      expect(result.totalInputs).toBe(2);
    });

    it("should handle 0x-prefixed transaction hex", async () => {
      mockedGetAddressUtxos.mockResolvedValue([
        {
          txid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          vout: 3,
          value: 100000,
          scriptPubKey: "script",
          confirmed: true,
        },
      ]);

      const result = await validateUtxosAvailable(
        "0x" + VALID_TX_SINGLE_INPUT,
        TEST_ADDRESS,
      );

      expect(result.allAvailable).toBe(true);
    });

    it("should propagate API errors", async () => {
      mockedGetAddressUtxos.mockRejectedValue(new Error("API unavailable"));

      await expect(
        validateUtxosAvailable(VALID_TX_SINGLE_INPUT, TEST_ADDRESS),
      ).rejects.toThrow("API unavailable");
    });
  });

  describe("assertUtxosAvailable", () => {
    const TEST_ADDRESS = "bc1qtest...";

    it("should not throw when all UTXOs are available", async () => {
      mockedGetAddressUtxos.mockResolvedValue([
        {
          txid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          vout: 3,
          value: 100000,
          scriptPubKey: "script",
          confirmed: true,
        },
      ]);

      await expect(
        assertUtxosAvailable(VALID_TX_SINGLE_INPUT, TEST_ADDRESS),
      ).resolves.not.toThrow();
    });

    it("should throw UtxoNotAvailableError when UTXO is missing", async () => {
      mockedGetAddressUtxos.mockResolvedValue([]);

      await expect(
        assertUtxosAvailable(VALID_TX_SINGLE_INPUT, TEST_ADDRESS),
      ).rejects.toThrow(UtxoNotAvailableError);
    });

    it("should include missing UTXOs in error", async () => {
      mockedGetAddressUtxos.mockResolvedValue([]);

      try {
        await assertUtxosAvailable(VALID_TX_SINGLE_INPUT, TEST_ADDRESS);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UtxoNotAvailableError);
        const utxoError = error as UtxoNotAvailableError;
        expect(utxoError.missingUtxos).toHaveLength(1);
        expect(utxoError.missingUtxos[0].txid).toBe(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
      }
    });

    it("should have singular message for one missing UTXO", async () => {
      mockedGetAddressUtxos.mockResolvedValue([]);

      try {
        await assertUtxosAvailable(VALID_TX_SINGLE_INPUT, TEST_ADDRESS);
      } catch (error) {
        expect(error).toBeInstanceOf(UtxoNotAvailableError);
        expect((error as Error).message).toContain("The UTXO for this peg-in");
        expect((error as Error).message).not.toContain("UTXOs");
      }
    });

    it("should have plural message for multiple missing UTXOs", async () => {
      const multiInputTx = createMultiInputTxHex([
        {
          txidLE:
            "1111111111111111111111111111111111111111111111111111111111111111",
          vout: 0,
        },
        {
          txidLE:
            "2222222222222222222222222222222222222222222222222222222222222222",
          vout: 1,
        },
      ]);

      // No UTXOs available
      mockedGetAddressUtxos.mockResolvedValue([]);

      try {
        await assertUtxosAvailable(multiInputTx, TEST_ADDRESS);
      } catch (error) {
        expect(error).toBeInstanceOf(UtxoNotAvailableError);
        expect((error as Error).message).toContain("2 UTXOs for this peg-in");
      }
    });
  });

  describe("UtxoNotAvailableError", () => {
    it("should have correct name", () => {
      const error = new UtxoNotAvailableError([{ txid: "test", vout: 0 }]);
      expect(error.name).toBe("UtxoNotAvailableError");
    });

    it("should store missing UTXOs", () => {
      const missing = [
        { txid: "txid1", vout: 0 },
        { txid: "txid2", vout: 1 },
      ];
      const error = new UtxoNotAvailableError(missing);
      expect(error.missingUtxos).toEqual(missing);
    });

    it("should be instanceof Error", () => {
      const error = new UtxoNotAvailableError([{ txid: "test", vout: 0 }]);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
