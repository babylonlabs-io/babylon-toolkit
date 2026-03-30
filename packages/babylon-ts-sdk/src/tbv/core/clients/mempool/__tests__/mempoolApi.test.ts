import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getAddressUtxos, getNetworkFees, getUtxoInfo } from "../mempoolApi";

const API_URL = "https://mempool.space/api";

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

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("getAddressUtxos", () => {
  const address = "bc1qtest";
  const validAddressInfo = { isvalid: true, scriptPubKey: "5120abcd" };

  function mockUtxoResponses(utxos: { value: number }[]) {
    const utxoList = utxos.map((u, i) => ({
      txid: `tx${i}`,
      vout: 0,
      value: u.value,
      status: { confirmed: true },
    }));

    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));
  }

  it("accepts valid satoshi values", async () => {
    mockUtxoResponses([{ value: 50000 }, { value: 100000 }]);

    const result = await getAddressUtxos(address, API_URL);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(100000);
    expect(result[1].value).toBe(50000);
  });

  it("rejects negative UTXO values", async () => {
    mockUtxoResponses([{ value: -1 }]);
    await expect(getAddressUtxos(address, API_URL)).rejects.toThrow(
      /Invalid UTXO value -1/,
    );
  });

  it("rejects zero UTXO values", async () => {
    mockUtxoResponses([{ value: 0 }]);
    await expect(getAddressUtxos(address, API_URL)).rejects.toThrow(
      /Invalid UTXO value 0/,
    );
  });

  it("rejects fractional UTXO values", async () => {
    mockUtxoResponses([{ value: 1.5 }]);
    await expect(getAddressUtxos(address, API_URL)).rejects.toThrow(
      /Invalid UTXO value 1\.5/,
    );
  });

  it("rejects values exceeding Bitcoin supply", async () => {
    const tooLarge = 21_000_000 * 1e8 + 1;
    mockUtxoResponses([{ value: tooLarge }]);
    await expect(getAddressUtxos(address, API_URL)).rejects.toThrow(
      /Invalid UTXO value/,
    );
  });

  it("rejects negative vout from API", async () => {
    const utxoList = [
      { txid: "tx0", vout: -1, value: 50000, status: { confirmed: true } },
    ];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(utxoList))
      .mockResolvedValueOnce(jsonResponse(validAddressInfo));
    await expect(getAddressUtxos(address, API_URL)).rejects.toThrow(
      /Invalid vout -1/,
    );
  });

  it("accepts the maximum valid value (21M BTC in sats)", async () => {
    mockUtxoResponses([{ value: 21_000_000 * 1e8 }]);

    const result = await getAddressUtxos(address, API_URL);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(21_000_000 * 1e8);
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
    const result = await getUtxoInfo("txid1", 0, API_URL);
    expect(result.value).toBe(50000);
  });

  it("rejects negative values", async () => {
    mockTxInfo(-100);
    await expect(getUtxoInfo("txid1", 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value -100/,
    );
  });

  it("rejects zero values", async () => {
    mockTxInfo(0);
    await expect(getUtxoInfo("txid1", 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value 0/,
    );
  });

  it("rejects fractional values", async () => {
    mockTxInfo(0.5);
    await expect(getUtxoInfo("txid1", 0, API_URL)).rejects.toThrow(
      /Invalid UTXO value 0\.5/,
    );
  });

  it("accepts the maximum valid value", async () => {
    mockTxInfo(21_000_000 * 1e8);
    const result = await getUtxoInfo("txid1", 0, API_URL);
    expect(result.value).toBe(21_000_000 * 1e8);
  });

  it("rejects values exceeding Bitcoin supply", async () => {
    mockTxInfo(21_000_000 * 1e8 + 1);
    await expect(getUtxoInfo("txid1", 0, API_URL)).rejects.toThrow(
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
    const result = await getUtxoInfo("txid1", 1, API_URL);
    expect(result.value).toBe(20000);
  });

  it("rejects vout equal to output count", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 10000, scriptpubkey: "5120aaaa" }],
      }),
    );
    await expect(getUtxoInfo("txid1", 1, API_URL)).rejects.toThrow(
      /Invalid vout 1/,
    );
  });

  it("rejects negative vout", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "5120abcd" }],
      }),
    );
    await expect(getUtxoInfo("txid1", -1, API_URL)).rejects.toThrow(
      /Invalid vout -1/,
    );
  });

  it("rejects fractional vout", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        vout: [{ value: 50000, scriptpubkey: "5120abcd" }],
      }),
    );
    await expect(getUtxoInfo("txid1", 0.5, API_URL)).rejects.toThrow(
      /Invalid vout 0\.5/,
    );
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

  it("accepts fee rates at the maximum bound", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...validFees, fastestFee: 10000 }),
    );
    const result = await getNetworkFees(API_URL);
    expect(result.fastestFee).toBe(10000);
  });
});
