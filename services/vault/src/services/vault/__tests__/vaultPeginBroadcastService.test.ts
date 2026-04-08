import { describe, expect, it, vi } from "vitest";

// Use vi.hoisted so mocks can reference these before module initialization
const { mockFetchUTXO, mockPsbt, mockTx, mockInput } = vi.hoisted(() => {
  const input = {
    hash: Buffer.from(
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      "hex",
    ),
    index: 0,
    sequence: 0xffffffff,
  };

  return {
    mockFetchUTXO: vi
      .fn()
      .mockResolvedValue({ scriptPubKey: "0014aabb", value: 100000 }),
    mockPsbt: {
      setVersion: vi.fn(),
      setLocktime: vi.fn(),
      addInput: vi.fn(),
      addOutput: vi.fn(),
      toHex: vi.fn().mockReturnValue("mock-psbt-hex"),
    },
    mockTx: {
      ins: [input],
      outs: [{ script: Buffer.from("0014deadbeef", "hex"), value: 90000 }],
      version: 2,
      locktime: 0,
    },
    mockInput: input,
  };
});

vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: vi.fn().mockResolvedValue("mock-txid"),
}));
vi.mock("bitcoinjs-lib", () => {
  // Psbt must be callable as a constructor (new Psbt())
  function PsbtCtor() {
    return mockPsbt;
  }
  PsbtCtor.fromHex = vi.fn(() => ({
    finalizeAllInputs: vi.fn(),
    extractTransaction: vi.fn(() => ({ toHex: vi.fn(() => "signed-hex") })),
    data: { inputs: [{ finalScriptWitness: Buffer.from("00", "hex") }] },
  }));
  return {
    Psbt: PsbtCtor,
    Transaction: { fromHex: vi.fn(() => mockTx) },
  };
});
vi.mock("../../../utils/btc", () => ({
  getPsbtInputFields: vi.fn(() => ({ witnessUtxo: {} })),
}));
vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test"),
}));
vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: mockFetchUTXO,
}));

import {
  broadcastPrePeginTransaction,
  utxosToExpectedRecord,
} from "../vaultPeginBroadcastService";

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

  it("normalizes txid to lowercase for consistent lookup", () => {
    const utxos = [
      {
        txid: "ABC123DEF456",
        vout: 0,
        value: 100000,
        scriptPubKey: "0014deadbeef",
      },
    ];

    const result = utxosToExpectedRecord(utxos);

    expect(result["abc123def456:0"]).toEqual({
      scriptPubKey: "0014deadbeef",
      value: 100000,
    });
    expect(result["ABC123DEF456:0"]).toBeUndefined();
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

describe("broadcastPrePeginTransaction — resolveInputUtxo behavior", () => {
  const basePubkey = "a".repeat(64);
  const baseParams = {
    unsignedTxHex: "deadbeef",
    btcWalletProvider: {
      signPsbt: vi.fn().mockResolvedValue("mock-signed-psbt-hex"),
    },
    depositorBtcPubkey: basePubkey,
  };

  // The txid derived from mockInput.hash reversed
  const expectedTxid = Buffer.from(mockInput.hash).reverse().toString("hex");

  it("uses expectedUtxos when all inputs are covered (skips mempool)", async () => {
    mockFetchUTXO.mockClear();

    const expectedUtxos = {
      [`${expectedTxid}:0`]: { scriptPubKey: "5120aabb", value: 100000 },
    };

    await broadcastPrePeginTransaction({ ...baseParams, expectedUtxos });

    expect(mockFetchUTXO).not.toHaveBeenCalled();
  });

  it("falls back to mempool when expectedUtxos is undefined", async () => {
    mockFetchUTXO.mockClear();

    await broadcastPrePeginTransaction({
      ...baseParams,
      expectedUtxos: undefined,
    });

    expect(mockFetchUTXO).toHaveBeenCalledWith(expectedTxid, 0);
  });

  it("throws when expectedUtxos is provided but missing an input entry", async () => {
    const expectedUtxos = {
      "wrongtxid:99": { scriptPubKey: "0014", value: 100000 },
    };

    await expect(
      broadcastPrePeginTransaction({ ...baseParams, expectedUtxos }),
    ).rejects.toThrow("missing entry for");
  });
});
