import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  getOracleAddress,
  getReservesPrices,
  getReservesPricesSafe,
} from "../oracle.js";

const SPOKE = "0x0000000000000000000000000000000000000001" as Address;
const ORACLE = "0x0000000000000000000000000000000000000002" as Address;

function makeClient(
  impl: (call: { functionName: string; args?: unknown[] }) => unknown,
): PublicClient {
  return {
    readContract: vi.fn(
      async (call: { functionName: string; args?: unknown[] }) => impl(call),
    ),
  } as unknown as PublicClient;
}

describe("getOracleAddress", () => {
  it("returns the address from Spoke.ORACLE()", async () => {
    const client = makeClient(({ functionName }) => {
      if (functionName !== "ORACLE") throw new Error("unexpected call");
      return ORACLE;
    });
    expect(await getOracleAddress(client, SPOKE)).toBe(ORACLE);
  });
});

describe("getReservesPrices", () => {
  it("returns the prices array unchanged", async () => {
    const prices = [8_000_000_000_000n, 100_000_000n];
    const client = makeClient(({ functionName }) => {
      if (functionName !== "getReservesPrices") {
        throw new Error("unexpected call");
      }
      return prices;
    });
    expect(await getReservesPrices(client, ORACLE, [1n, 2n])).toEqual(prices);
  });

  it("propagates the revert when any reserve in the batch is bad", async () => {
    const client = makeClient(() => {
      throw new Error("execution reverted");
    });
    await expect(getReservesPrices(client, ORACLE, [7n])).rejects.toThrow();
  });
});

describe("getReservesPricesSafe", () => {
  it("isolates per-reserve reverts and returns nulls in place", async () => {
    const client = makeClient(({ args }) => {
      const [ids] = args as [bigint[]];
      if (ids[0] === 99n) throw new Error("execution reverted");
      return [123_456_789n];
    });
    const out = await getReservesPricesSafe(client, ORACLE, [1n, 99n, 2n]);
    expect(out).toEqual([
      { reserveId: 1n, priceRaw: 123_456_789n, error: null },
      { reserveId: 99n, priceRaw: null, error: expect.any(Error) },
      { reserveId: 2n, priceRaw: 123_456_789n, error: null },
    ]);
  });

  it("returns empty array when called with no reserves", async () => {
    const client = makeClient(() => {
      throw new Error("should not be called");
    });
    expect(await getReservesPricesSafe(client, ORACLE, [])).toEqual([]);
  });
});
