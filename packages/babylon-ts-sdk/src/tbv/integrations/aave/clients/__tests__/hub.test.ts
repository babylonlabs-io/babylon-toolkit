import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { getAssetDrawnRatesSafe } from "../hub.js";

const HUB = "0x0000000000000000000000000000000000000003" as Address;

describe("getAssetDrawnRatesSafe", () => {
  it("returns rates in input order from a single multicall", async () => {
    const multicall = vi.fn(async () => [
      { status: "success", result: 37_000_000_000_000_000_000_000_000n },
      { status: "success", result: 58_610_000_000_000_000_000_000_000n },
    ]);
    const client = { multicall } as unknown as PublicClient;

    const out = await getAssetDrawnRatesSafe(client, [
      { hub: HUB, assetId: 0 },
      { hub: HUB, assetId: 1 },
    ]);

    expect(out).toEqual([
      {
        hub: HUB,
        assetId: 0,
        rateRay: 37_000_000_000_000_000_000_000_000n,
        error: null,
      },
      {
        hub: HUB,
        assetId: 1,
        rateRay: 58_610_000_000_000_000_000_000_000n,
        error: null,
      },
    ]);
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("builds one allowFailure getAssetDrawnRate entry per asset", async () => {
    const multicall = vi.fn(
      async (_arg: {
        contracts: { address: string; functionName: string; args: unknown[] }[];
        allowFailure: boolean;
      }) => [{ status: "success", result: 5n }],
    );
    const client = { multicall } as unknown as PublicClient;

    await getAssetDrawnRatesSafe(client, [{ hub: HUB, assetId: 3 }]);

    const arg = multicall.mock.calls[0][0];
    expect(arg.allowFailure).toBe(true);
    expect(arg.contracts).toHaveLength(1);
    expect(arg.contracts[0].address).toBe(HUB);
    expect(arg.contracts[0].functionName).toBe("getAssetDrawnRate");
    expect(arg.contracts[0].args).toEqual([3n]);
  });

  it("isolates per-asset reverts and returns nulls in place", async () => {
    const multicall = vi.fn(
      async ({ contracts }: { contracts: { args: unknown[] }[] }) =>
        contracts.map((c) => {
          const [assetId] = c.args as [bigint];
          return assetId === 99n
            ? { status: "failure", error: new Error("execution reverted") }
            : { status: "success", result: 42n };
        }),
    );
    const client = { multicall } as unknown as PublicClient;

    const out = await getAssetDrawnRatesSafe(client, [
      { hub: HUB, assetId: 1 },
      { hub: HUB, assetId: 99 },
      { hub: HUB, assetId: 2 },
    ]);

    expect(out).toEqual([
      { hub: HUB, assetId: 1, rateRay: 42n, error: null },
      { hub: HUB, assetId: 99, rateRay: null, error: expect.any(Error) },
      { hub: HUB, assetId: 2, rateRay: 42n, error: null },
    ]);
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("never throws on a network-level multicall failure — marks every asset failed", async () => {
    const multicall = vi.fn(async () => {
      throw new Error("RPC timeout");
    });
    const client = { multicall } as unknown as PublicClient;

    const out = await getAssetDrawnRatesSafe(client, [
      { hub: HUB, assetId: 0 },
      { hub: HUB, assetId: 1 },
    ]);

    expect(out).toHaveLength(2);
    expect(out.every((r) => r.rateRay === null)).toBe(true);
    expect(out.every((r) => r.error instanceof Error)).toBe(true);
    expect(out.map((r) => r.assetId)).toEqual([0, 1]);
  });

  it("returns empty array when called with no assets and issues no RPC", async () => {
    const multicall = vi.fn();
    const client = { multicall } as unknown as PublicClient;

    expect(await getAssetDrawnRatesSafe(client, [])).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });
});
