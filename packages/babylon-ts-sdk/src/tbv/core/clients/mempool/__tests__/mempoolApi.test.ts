import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getAddressTxs,
  getAddressUtxos,
  getNetworkFees,
  getTxHex,
  getTxInfo,
  getUtxoInfo,
  pushTx,
} from "../mempoolApi";

const API_URL = "https://mempool.space/api";

/** Valid 64-hex-char txid for tests */
const VALID_TXID =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const VALID_TXID_2 =
  "1111111111111111111111111111111111111111111111111111111111111111";

/** Valid bech32 address (42 alphanumeric chars, passes format gate) */
const VALID_ADDRESS = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

const mockFetch = vi.fn();

beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("txid format validation", () => {
  it("getTxInfo rejects non-hex txid", async () => {
    await expect(getTxInfo("not-valid-hex!", API_URL)).rejects.toThrow(
      /Invalid transaction ID format/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("getTxInfo rejects short txid", async () => {
    await expect(getTxInfo("abcdef", API_URL)).rejects.toThrow(
      /Invalid transaction ID format/,
    );
  });

  it("getTxInfo rejects txid with path traversal", async () => {
    await expect(getTxInfo("../../../etc/passwd" + "a".repeat(46), API_URL)).rejects.toThrow(
      /Invalid transaction ID format/,
    );
  });

  it("getTxHex rejects invalid txid", async () => {
    await expect(getTxHex("bad-txid", API_URL)).rejects.toThrow(
      /Invalid transaction ID format/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("getUtxoInfo rejects invalid txid", async () => {
    await expect(getUtxoInfo("bad-txid", 0, API_URL)).rejects.toThrow(
      /Invalid transaction ID format/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("address format validation", () => {
  it("getAddressUtxos rejects address with special characters", async () => {
    await expect(getAddressUtxos("bc1q../etc/passwd", API_URL)).rejects.toThrow(
      /Invalid Bitcoin address format/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("getAddressUtxos rejects too-short address", async () => {
    await expect(getAddressUtxos("bc1q", API_URL)).rejects.toThrow(
      /Invalid Bitcoin address format/,
    );
  });

  it("getAddressTxs rejects invalid address", async () => {
    await expect(getAddressTxs("invalid/address", API_URL)).rejects.toThrow(
      /Invalid Bitcoin address format/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("getAddressUtxos", () => {
  const validAddressInfo = { isvalid: true, scriptPubKey: "5120abcd" };

  /**
   * Mock responses with custom per-UTXO tx verification data.
   * Allows tests to inject mismatches for cross-verification checks.
   */
  function mockUtxoResponsesWithVerification(
    utxoList: { txid: string; vout: number; value: number }[],
    txVerifications: { value: number; scriptpubkey: string }[],
  ) {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          utxoList.map((u) => ({ ...u, status: { confirmed: true } })),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    for (const txData of txVerifications) {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ vout: [txData] }),
      );
    }
  }

  it("accepts valid satoshi values with cross-verification", async () => {
    mockUtxoResponsesWithVerification(
      [
        { txid: VALID_TXID, vout: 0, value: 50000 },
        { txid: VALID_TXID_2, vout: 0, value: 100000 },
      ],
      [
        { value: 50000, scriptpubkey: "5120abcd" },
        { value: 100000, scriptpubkey: "5120abcd" },
      ],
    );

    const result = await getAddressUtxos(VALID_ADDRESS, API_URL);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(100000);
    expect(result[1].value).toBe(50000);
  });

  it("rejects negative UTXO values", async () => {
    const utxoList = [
      { txid: VALID_TXID, vout: 0, value: -1, status: { confirmed: true } },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid UTXO value -1/,
    );
  });

  it("rejects zero UTXO values", async () => {
    const utxoList = [
      { txid: VALID_TXID, vout: 0, value: 0, status: { confirmed: true } },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid UTXO value 0/,
    );
  });

  it("rejects fractional UTXO values", async () => {
    const utxoList = [
      { txid: VALID_TXID, vout: 0, value: 1.5, status: { confirmed: true } },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid UTXO value 1\.5/,
    );
  });

  it("rejects values exceeding Bitcoin supply", async () => {
    const tooLarge = 21_000_000 * 1e8 + 1;
    const utxoList = [
      {
        txid: VALID_TXID,
        vout: 0,
        value: tooLarge,
        status: { confirmed: true },
      },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid UTXO value/,
    );
  });

  it("rejects negative vout from API", async () => {
    const utxoList = [
      { txid: VALID_TXID, vout: -1, value: 50000, status: { confirmed: true } },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid vout -1/,
    );
  });

  it("rejects fractional vout from API", async () => {
    const utxoList = [
      {
        txid: VALID_TXID,
        vout: 1.5,
        value: 50000,
        status: { confirmed: true },
      },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid vout 1\.5/,
    );
  });

  it("accepts the maximum valid value (21M BTC in sats)", async () => {
    const maxValue = 21_000_000 * 1e8;
    mockUtxoResponsesWithVerification(
      [{ txid: VALID_TXID, vout: 0, value: maxValue }],
      [{ value: maxValue, scriptpubkey: "5120abcd" }],
    );

    const result = await getAddressUtxos(VALID_ADDRESS, API_URL);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(maxValue);
  });

  it("rejects when cross-verified value does not match listing", async () => {
    mockUtxoResponsesWithVerification(
      [{ txid: VALID_TXID, vout: 0, value: 50000 }],
      [{ value: 99999, scriptpubkey: "5120abcd" }],
    );

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /UTXO value mismatch.*listing reports 50000.*transaction reports 99999/,
    );
  });

  it("rejects when cross-verified scriptPubKey does not match address", async () => {
    mockUtxoResponsesWithVerification(
      [{ txid: VALID_TXID, vout: 0, value: 50000 }],
      [{ value: 50000, scriptpubkey: "0014differentscript" }],
    );

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /UTXO scriptPubKey mismatch/,
    );
  });

  it("rejects when cross-verified vout is out of range", async () => {
    // UTXO claims vout=2, but tx only has 1 output
    const utxoList = [
      { txid: VALID_TXID, vout: 2, value: 50000, status: { confirmed: true } },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo))
      .mockResolvedValueOnce(
        jsonResponse({ vout: [{ value: 50000, scriptpubkey: "5120abcd" }] }),
      );

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /UTXO vout 2 out of range/,
    );
  });

  it("rejects UTXO with invalid txid format from listing", async () => {
    const utxoList = [
      {
        txid: "short",
        vout: 0,
        value: 50000,
        status: { confirmed: true },
      },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));

    await expect(getAddressUtxos(VALID_ADDRESS, API_URL)).rejects.toThrow(
      /Invalid transaction ID format/,
    );
  });
});

describe("getUtxoInfo", () => {
  function mockTxInfo(value: number) {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value, scriptpubkey: "5120abcd" }],
      }),
    );
  }

  it("accepts valid satoshi values", async () => {
    mockTxInfo(50000);
    const result = await getUtxoInfo(VALID_TXID, 0, API_URL);
    expect(result.value).toBe(50000);
  });

  it("rejects negative values", async () => {
    mockTxInfo(-100);
    await expect(getUtxoInfo(VALID_TXID, 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value -100/,
    );
  });

  it("rejects zero values", async () => {
    mockTxInfo(0);
    await expect(getUtxoInfo(VALID_TXID, 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value 0/,
    );
  });

  it("rejects fractional values", async () => {
    mockTxInfo(0.5);
    await expect(getUtxoInfo(VALID_TXID, 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value 0\.5/,
    );
  });

  it("accepts the maximum valid value", async () => {
    mockTxInfo(21_000_000 * 1e8);
    const result = await getUtxoInfo(VALID_TXID, 0, API_URL);
    expect(result.value).toBe(21_000_000 * 1e8);
  });

  it("rejects values exceeding Bitcoin supply", async () => {
    mockTxInfo(21_000_000 * 1e8 + 1);
    await expect(getUtxoInfo(VALID_TXID, 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value/,
    );
  });

  it("accepts vout at the last valid index", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [
          { value: 10000, scriptpubkey: "5120aaaa" },
          { value: 20000, scriptpubkey: "5120bbbb" },
        ],
      }),
    );
    const result = await getUtxoInfo(VALID_TXID, 1, API_URL);
    expect(result.value).toBe(20000);
  });

  it("rejects vout equal to output count", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 10000, scriptpubkey: "5120aaaa" }],
      }),
    );
    await expect(getUtxoInfo(VALID_TXID, 1, API_URL)).rejects.toThrow(
      /Invalid vout 1/,
    );
  });

  it("rejects negative vout", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "5120abcd" }],
      }),
    );
    await expect(getUtxoInfo(VALID_TXID, -1, API_URL)).rejects.toThrow(
      /Invalid vout -1/,
    );
  });

  it("rejects fractional vout", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "5120abcd" }],
      }),
    );
    await expect(getUtxoInfo(VALID_TXID, 0.5, API_URL)).rejects.toThrow(
      /Invalid vout 0\.5/,
    );
  });
});

describe("scriptPubKey format validation", () => {
  it("getUtxoInfo rejects non-hex scriptPubKey", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "not-hex-data!" }],
      }),
    );
    await expect(getUtxoInfo(VALID_TXID, 0, API_URL)).rejects.toThrow(
      /Invalid scriptPubKey: not valid hex/,
    );
  });

  it("getUtxoInfo rejects unrecognized script type", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "ffff00112233" }],
      }),
    );
    await expect(getUtxoInfo(VALID_TXID, 0, API_URL)).rejects.toThrow(
      /Unrecognized scriptPubKey type/,
    );
  });

  it("getUtxoInfo accepts P2TR scriptPubKey", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "5120abcdef1234567890" }],
      }),
    );
    const result = await getUtxoInfo(VALID_TXID, 0, API_URL);
    expect(result.scriptPubKey).toBe("5120abcdef1234567890");
  });

  it("getUtxoInfo accepts P2WPKH scriptPubKey", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "0014abcdef1234567890" }],
      }),
    );
    const result = await getUtxoInfo(VALID_TXID, 0, API_URL);
    expect(result.scriptPubKey).toBe("0014abcdef1234567890");
  });

  it("getUtxoInfo accepts P2PKH scriptPubKey", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "76a914abcdef88ac" }],
      }),
    );
    const result = await getUtxoInfo(VALID_TXID, 0, API_URL);
    expect(result.scriptPubKey).toBe("76a914abcdef88ac");
  });
});

describe("getNetworkFees", () => {
  const validFees = {
    fastestFee: 50,
    halfHourFee: 30,
    hourFee: 20,
    economyFee: 10,
    minimumFee: 1,
  };

  it("accepts valid fee rates", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(validFees));
    const result = await getNetworkFees(API_URL);
    expect(result.fastestFee).toBe(50);
    expect(result.minimumFee).toBe(1);
  });

  it("rejects negative fee rates", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, fastestFee: -1 }),
    );
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Invalid fee rate fastestFee=-1/,
    );
  });

  it("rejects zero fee rates", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, minimumFee: 0 }),
    );
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Invalid fee rate minimumFee=0/,
    );
  });

  it("rejects fractional fee rates", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, fastestFee: 1.5 }),
    );
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Invalid fee rate fastestFee=1\.5/,
    );
  });

  it("rejects null fee rates (NaN serializes to null over JSON)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, hourFee: null }),
    );
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Invalid fee rate hourFee/,
    );
  });

  it("rejects missing fee fields", async () => {
    const incompleteFees = {
      fastestFee: 50,
      halfHourFee: 30,
      hourFee: 20,
      economyFee: 10,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(incompleteFees));
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Invalid fee rate minimumFee/,
    );
  });

  it("rejects excessively high fee rates", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, fastestFee: 10001 }),
    );
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Invalid fee rate fastestFee=10001/,
    );
  });

  it("rejects fee rates with invalid ordering", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        fastestFee: 10,
        halfHourFee: 30,
        hourFee: 20,
        economyFee: 10,
        minimumFee: 1,
      }),
    );
    await expect(getNetworkFees(API_URL)).rejects.toThrow(
      /Fee rate ordering violation/,
    );
  });

  it("accepts fee rates at the maximum bound", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, fastestFee: 10000 }),
    );
    const result = await getNetworkFees(API_URL);
    expect(result.fastestFee).toBe(10000);
  });
});

describe("request timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockHangingFetch() {
    mockFetch.mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(
              new DOMException(
                "The operation was aborted.",
                "AbortError",
              ),
            );
          });
        }),
    );
  }

  it("aborts getNetworkFees after 30s timeout", async () => {
    mockHangingFetch();

    const promise = getNetworkFees(API_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out after 30000ms/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("aborts pushTx after 30s timeout", async () => {
    mockHangingFetch();

    const promise = pushTx("deadbeef", API_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out after 30000ms/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("aborts getTxHex after 30s timeout", async () => {
    mockHangingFetch();

    const promise = getTxHex(VALID_TXID, API_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out after 30000ms/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("aborts getAddressUtxos after 30s timeout", async () => {
    mockHangingFetch();

    const promise = getAddressUtxos(VALID_ADDRESS, API_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out after 30000ms/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
