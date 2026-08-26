/** Tests for UTXO validation service (I/O wrapper layer). */

import { getAddressUtxos } from "@babylonlabs-io/ts-sdk";
import { UtxoNotAvailableError } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertUtxosAvailable,
  validateUtxosAvailable,
} from "../vaultUtxoValidationService";

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
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
  "03000000" +
  "6b" +
  "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" +
  "ffffffff" +
  "01" +
  "605af40500000000" +
  "19" +
  "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" +
  "00000000";

describe("vaultUtxoValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateUtxosAvailable", () => {
    const TEST_ADDRESS = "bc1qtest...";

    it("should fetch UTXOs and delegate to SDK validation", async () => {
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

      expect(mockedGetAddressUtxos).toHaveBeenCalledWith(
        TEST_ADDRESS,
        "https://mempool.space/api",
      );
      expect(result.allAvailable).toBe(true);
      expect(result.totalInputs).toBe(1);
    });

    it("should return missing UTXOs when mempool has none", async () => {
      mockedGetAddressUtxos.mockResolvedValue([]);

      const result = await validateUtxosAvailable(
        VALID_TX_SINGLE_INPUT,
        TEST_ADDRESS,
      );

      expect(result.allAvailable).toBe(false);
      expect(result.missingUtxos).toHaveLength(1);
    });

    it("should propagate mempool API errors on validate", async () => {
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

    it("should propagate mempool API errors on assert", async () => {
      mockedGetAddressUtxos.mockRejectedValue(new Error("Network timeout"));

      await expect(
        assertUtxosAvailable(VALID_TX_SINGLE_INPUT, TEST_ADDRESS),
      ).rejects.toThrow("Network timeout");
    });
  });
});
