import { describe, expect, it, vi } from "vitest";

// Mock external dependencies that require bitcoinjs-lib ecc initialization
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: vi.fn(),
  getTxInfo: vi.fn(),
}));
vi.mock("bitcoinjs-lib", () => ({
  Psbt: vi.fn(),
  Transaction: { fromHex: vi.fn() },
}));
vi.mock("../../../utils/btc", () => ({
  getPsbtInputFields: vi.fn(),
}));
vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test"),
}));
vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: vi.fn(),
}));

import { utxosToExpectedRecord } from "../vaultPeginBroadcastService";

describe("utxosToExpectedRecord", () => {
  it("converts a valid UTXO array to a keyed record", () => {
    const utxos = [
      {
        txid: "abc123",
        vout: 0,
        value: 100000,
        scriptPubKey: "0014deadbeef",
      },
      {
        txid: "def456",
        vout: 1,
        value: "200000",
        scriptPubKey: "5120cafebabe",
      },
    ];

    const result = utxosToExpectedRecord(utxos);

    expect(result).toEqual({
      "abc123:0": { scriptPubKey: "0014deadbeef", value: 100000 },
      "def456:1": { scriptPubKey: "5120cafebabe", value: 200000 },
    });
  });

  it("throws on NaN value", () => {
    const utxos = [
      { txid: "abc123", vout: 0, value: "not-a-number", scriptPubKey: "0014" },
    ];
    expect(() => utxosToExpectedRecord(utxos)).toThrow("Invalid UTXO value");
  });

  it("throws on negative value", () => {
    const utxos = [
      { txid: "abc123", vout: 0, value: -100, scriptPubKey: "0014" },
    ];
    expect(() => utxosToExpectedRecord(utxos)).toThrow("Invalid UTXO value");
  });

  it("throws on non-hex txid", () => {
    const utxos = [
      { txid: "not-hex!", vout: 0, value: 100, scriptPubKey: "0014" },
    ];
    expect(() => utxosToExpectedRecord(utxos)).toThrow("Invalid UTXO txid");
  });

  it("throws on empty txid", () => {
    const utxos = [{ txid: "", vout: 0, value: 100, scriptPubKey: "0014" }];
    expect(() => utxosToExpectedRecord(utxos)).toThrow("Invalid UTXO txid");
  });

  it("throws on non-hex scriptPubKey", () => {
    const utxos = [
      { txid: "abc123", vout: 0, value: 100, scriptPubKey: "xyz!" },
    ];
    expect(() => utxosToExpectedRecord(utxos)).toThrow(
      "Invalid UTXO scriptPubKey",
    );
  });
});
