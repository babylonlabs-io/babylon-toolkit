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
  it("returns prices in input order from a single multicall", async () => {
    const multicall = vi.fn(async () => [
      { status: "success", result: [100n] },
      { status: "success", result: [200n] },
    ]);
    const client = { multicall } as unknown as PublicClient;

    const out = await getReservesPricesSafe(client, ORACLE, [1n, 2n]);

    expect(out).toEqual([
      { reserveId: 1n, priceRaw: 100n, error: null },
      { reserveId: 2n, priceRaw: 200n, error: null },
    ]);
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("builds one allowFailure entry per reserve as getReservesPrices([id])", async () => {
    const multicall = vi.fn(
      async (_arg: {
        contracts: { functionName: string; args: unknown[] }[];
        allowFailure: boolean;
      }) => [{ status: "success", result: [5n] }],
    );
    const client = { multicall } as unknown as PublicClient;

    await getReservesPricesSafe(client, ORACLE, [7n]);

    const arg = multicall.mock.calls[0][0];
    expect(arg.allowFailure).toBe(true);
    expect(arg.contracts).toHaveLength(1);
    expect(arg.contracts[0].functionName).toBe("getReservesPrices");
    expect(arg.contracts[0].args).toEqual([[7n]]);
  });

  it("isolates per-reserve reverts and returns nulls in place", async () => {
    const multicall = vi.fn(
      async ({ contracts }: { contracts: { args: unknown[] }[] }) =>
        contracts.map((c) => {
          const [ids] = c.args as [bigint[]];
          return ids[0] === 99n
            ? { status: "failure", error: new Error("execution reverted") }
            : { status: "success", result: [123_456_789n] };
        }),
    );
    const client = { multicall } as unknown as PublicClient;

    const out = await getReservesPricesSafe(client, ORACLE, [1n, 99n, 2n]);

    expect(out).toEqual([
      { reserveId: 1n, priceRaw: 123_456_789n, error: null },
      { reserveId: 99n, priceRaw: null, error: expect.any(Error) },
      { reserveId: 2n, priceRaw: 123_456_789n, error: null },
    ]);
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("never throws on a network-level multicall failure — marks every reserve failed", async () => {
    const multicall = vi.fn(async () => {
      throw new Error("RPC timeout");
    });
    const client = { multicall } as unknown as PublicClient;

    const out = await getReservesPricesSafe(client, ORACLE, [1n, 2n]);

    expect(out).toHaveLength(2);
    expect(out.every((r) => r.priceRaw === null)).toBe(true);
    expect(out.every((r) => r.error instanceof Error)).toBe(true);
    expect(out.map((r) => r.reserveId)).toEqual([1n, 2n]);
  });

  it("returns empty array when called with no reserves and issues no RPC", async () => {
    const multicall = vi.fn();
    const client = { multicall } as unknown as PublicClient;

    expect(await getReservesPricesSafe(client, ORACLE, [])).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });
});
