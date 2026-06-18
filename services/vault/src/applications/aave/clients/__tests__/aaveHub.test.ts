import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAssetLiquiditiesSafe,
  getProjectedBorrowAprPercentsSafe,
} from "../aaveHub";

// vitest hoists vi.mock above imports; the factory closes over `multicall`,
// which is initialized before the mocked module is first imported.
const multicall = vi.fn();
vi.mock("../../../../clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => ({ multicall }) },
}));

// aaveHub.ts also re-exports an SDK rate read; stub the SDK so the module loads
// without pulling the real package into the test.
vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", () => ({
  getAssetDrawnRatesSafe: vi.fn(),
}));

const HUB = "0x0000000000000000000000000000000000000003" as Address;
const IRM = "0x0000000000000000000000000000000000000004" as Address;
const RAY = 10n ** 27n;

describe("getAssetLiquiditiesSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pairs liquidity + owed per asset into one result", async () => {
    multicall.mockResolvedValueOnce([
      { status: "success", result: 100n },
      { status: "success", result: 30n },
      { status: "success", result: 500n },
      { status: "success", result: 0n },
    ]);

    const out = await getAssetLiquiditiesSafe([
      { hub: HUB, assetId: 1 },
      { hub: HUB, assetId: 2 },
    ]);

    expect(out).toEqual([
      {
        hub: HUB,
        assetId: 1,
        availableLiquidityRaw: 100n,
        totalOwedRaw: 30n,
        error: null,
      },
      {
        hub: HUB,
        assetId: 2,
        availableLiquidityRaw: 500n,
        totalOwedRaw: 0n,
        error: null,
      },
    ]);
  });

  it("nulls an asset whole when either leg reverts (no half-read)", async () => {
    multicall.mockResolvedValueOnce([
      { status: "success", result: 100n },
      { status: "failure", error: new Error("owed reverted") },
    ]);

    const [result] = await getAssetLiquiditiesSafe([{ hub: HUB, assetId: 1 }]);

    expect(result.availableLiquidityRaw).toBeNull();
    expect(result.totalOwedRaw).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });

  it("marks every asset failed on a network-level multicall throw", async () => {
    multicall.mockRejectedValueOnce(new Error("RPC down"));

    const out = await getAssetLiquiditiesSafe([
      { hub: HUB, assetId: 1 },
      { hub: HUB, assetId: 2 },
    ]);

    expect(out).toHaveLength(2);
    for (const result of out) {
      expect(result.availableLiquidityRaw).toBeNull();
      expect(result.totalOwedRaw).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("skips the multicall entirely for an empty request list", async () => {
    expect(await getAssetLiquiditiesSafe([])).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });
});

const PARAMS = {
  optimalUsage: 0.9,
  baseRate: 0.0, // 0%
  growthBefore: 0.04, // +4% across [0, optimal]
  growthAfter: 0.6, // +60% across [optimal, 100%]
};

/**
 * Faithful float port of the on-chain kinked rate model
 * (AssetInterestRateStrategy.calculateInterestRate), used to give the mocked
 * Hub a realistic rate curve. Usage is `drawn / (liquidity + drawn + swept)`.
 */
function modelRateRay(liquidity: bigint, drawn: bigint, swept: bigint): bigint {
  const denom = liquidity + drawn + swept;
  const usage = denom === 0n ? 0 : Number(drawn) / Number(denom);
  const { optimalUsage, baseRate, growthBefore, growthAfter } = PARAMS;
  const rate =
    usage <= optimalUsage
      ? baseRate + (growthBefore * usage) / optimalUsage
      : baseRate +
        growthBefore +
        (growthAfter * (usage - optimalUsage)) / (1 - optimalUsage);
  return BigInt(Math.round(rate * Number(RAY)));
}

/**
 * Mock Hub: round 1 returns the asset totals + strategy address; round 2
 * answers `calculateInterestRate` from whatever (liquidity, drawn, swept) args
 * it is handed, so the test verifies the projection the reader builds.
 */
function setupHub(
  totals: { liquidity: bigint; drawn: bigint; swept: bigint },
  opts: { totalsRevert?: boolean; currentRevert?: boolean } = {},
) {
  multicall.mockImplementation(
    async ({
      contracts,
    }: {
      contracts: { functionName: string; args: unknown[] }[];
    }) => {
      if (contracts[0].functionName !== "calculateInterestRate") {
        // Round 1: asset totals + config.
        return [
          opts.totalsRevert
            ? { status: "failure", error: new Error("reverted") }
            : { status: "success", result: totals.liquidity },
          { status: "success", result: [totals.drawn, 0n] },
          { status: "success", result: totals.swept },
          { status: "success", result: { irStrategy: IRM } },
        ];
      }
      // Round 2: rate at each (liquidity, drawn, swept) tuple.
      return contracts.map((c, i) => {
        if (opts.currentRevert && i === 0) {
          return { status: "failure", error: new Error("reverted") };
        }
        const [, liquidity, drawn, , swept] = c.args as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        return {
          status: "success",
          result: modelRateRay(liquidity, drawn, swept),
        };
      });
    },
  );
}

describe("getProjectedBorrowAprPercentsSafe", () => {
  beforeEach(() => {
    multicall.mockReset();
  });

  it("returns the current rate and a higher projected rate after the borrow", async () => {
    setupHub({ liquidity: 600n, drawn: 400n, swept: 0n });

    const out = await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 200n,
    });

    // Current usage 400/1000 = 0.40 (below optimal): 0.40/0.90 * 4% ≈ 1.778%.
    expect(out.currentPercent).toBeCloseTo(0.04 * (0.4 / 0.9) * 100, 6);
    // Post-borrow usage 600/1000 = 0.60: 0.60/0.90 * 4% ≈ 2.667%.
    expect(out.projectedPercent).toBeCloseTo(0.04 * (0.6 / 0.9) * 100, 6);
    expect(out.projectedPercent!).toBeGreaterThan(out.currentPercent!);
    expect(out.error).toBeNull();
  });

  it("projects from post-borrow totals: drawn + amount, liquidity - amount", async () => {
    setupHub({ liquidity: 600n, drawn: 400n, swept: 7n });

    await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 150n,
    });

    const rateCall = multicall.mock.calls.find(
      (c) => c[0].contracts[0].functionName === "calculateInterestRate",
    )!;
    const [currentArgs, projectedArgs] = rateCall[0].contracts.map(
      (c: { args: unknown[] }) => c.args,
    );
    // [assetId, liquidity, drawn, deficit, swept]
    expect(currentArgs).toEqual([5n, 600n, 400n, 0n, 7n]);
    expect(projectedArgs).toEqual([5n, 450n, 550n, 0n, 7n]);
  });

  it("crosses the optimal kink into the steep slope as utilization rises", async () => {
    // Current usage 0.80 (below optimal 0.90); borrowing pushes it to 0.95.
    setupHub({ liquidity: 200n, drawn: 800n, swept: 0n });

    const out = await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 150n,
    });

    expect(out.currentPercent).toBeCloseTo(0.04 * (0.8 / 0.9) * 100, 6);
    // 0.95 > 0.90: base + growthBefore + growthAfter*(0.05/0.10) = 4% + 30%.
    expect(out.projectedPercent).toBeCloseTo((0.04 + 0.6 * 0.5) * 100, 6);
  });

  it("caps the moved amount at available liquidity when the borrow exceeds it", async () => {
    setupHub({ liquidity: 100n, drawn: 900n, swept: 0n });

    const out = await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 500n, // > liquidity
    });

    const rateCall = multicall.mock.calls.find(
      (c) => c[0].contracts[0].functionName === "calculateInterestRate",
    )!;
    const projectedArgs = rateCall[0].contracts[1].args;
    // The move is capped at liquidity (100): liquidity -> 0, drawn 900 -> 1000.
    // The denominator (liquidity + drawn + swept = 1000) stays invariant.
    expect(projectedArgs).toEqual([5n, 0n, 1000n, 0n, 0n]);
    expect(out.projectedPercent).not.toBeNull();
  });

  it("returns nulls without issuing the rate call when the totals read reverts", async () => {
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { totalsRevert: true },
    );

    const out = await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 100n,
    });

    expect(out).toEqual({
      currentPercent: null,
      projectedPercent: null,
      error: expect.any(Error),
    });
    // Only the totals multicall ran; no rate multicall.
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("nulls only the leg whose strategy call reverts", async () => {
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { currentRevert: true },
    );

    const out = await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 100n,
    });

    expect(out.currentPercent).toBeNull();
    expect(out.projectedPercent).not.toBeNull();
    expect(out.error).toBeNull();
  });

  it("never throws on a network-level multicall failure", async () => {
    multicall.mockRejectedValue(new Error("RPC timeout"));

    const out = await getProjectedBorrowAprPercentsSafe({
      hub: HUB,
      assetId: 5,
      borrowAmountRaw: 100n,
    });

    expect(out.currentPercent).toBeNull();
    expect(out.projectedPercent).toBeNull();
    expect(out.error).toBeInstanceOf(Error);
  });
});
