import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInterestRateModelCurveSafe } from "../aaveIrm";

// vitest hoists vi.mock above imports; the factory closes over `multicall`,
// which is initialized before the mocked module is first imported.
const multicall = vi.fn();
vi.mock("../../../../clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => ({ multicall }) },
}));

// aaveHub.ts (whose ABI fragments/helpers this client reuses) imports the SDK
// rate read; stub it so the module loads without pulling the real package in.
vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", () => ({
  getAssetDrawnRatesSafe: vi.fn(),
}));

const HUB = "0x0000000000000000000000000000000000000003" as Address;
const IRM = "0x0000000000000000000000000000000000000004" as Address;
const RAY = 10n ** 27n;

const PARAMS = {
  optimalUsageBps: 9000n, // 90%
  baseDrawnRateBps: 0n,
  rateGrowthBeforeOptimalBps: 400n, // +4%
  rateGrowthAfterOptimalBps: 6000n, // +60%
};

/**
 * Faithful float port of the on-chain kinked rate model
 * (AssetInterestRateStrategy.calculateInterestRate), used to give the mocked
 * Hub a realistic rate curve. Usage is `drawn / (liquidity + drawn + swept)`.
 */
function modelRateRay(liquidity: bigint, drawn: bigint, swept: bigint): bigint {
  const denom = liquidity + drawn + swept;
  const usage = denom === 0n ? 0 : Number(drawn) / Number(denom);
  const optimal = Number(PARAMS.optimalUsageBps) / 10_000;
  const base = Number(PARAMS.baseDrawnRateBps) / 10_000;
  const growthBefore = Number(PARAMS.rateGrowthBeforeOptimalBps) / 10_000;
  const growthAfter = Number(PARAMS.rateGrowthAfterOptimalBps) / 10_000;
  const rate =
    usage <= optimal
      ? base + (growthBefore * usage) / optimal
      : base + growthBefore + (growthAfter * (usage - optimal)) / (1 - optimal);
  return BigInt(Math.round(rate * Number(RAY)));
}

/**
 * Mock Hub + strategy: round 1 returns totals + config, round 2 returns the
 * kink/rate-shape data, round 3 answers `calculateInterestRate` from whatever
 * (liquidity, drawn, swept) args it is handed, so the test verifies the
 * per-sample args the reader builds rather than hardcoding expected rates.
 */
function setupHub(
  totals: {
    liquidity: bigint;
    drawn: bigint;
    swept: bigint;
    deficitRay?: bigint;
  },
  opts: {
    totalsRevert?: boolean;
    rateDataRevert?: boolean;
    curveLegRevertAt?: number;
    /** Overrides the strategy's optimalUsageRatio (e.g. a RAY-scaled value). */
    optimalUsageOverride?: bigint;
    /** Added to every curve leg's rate — simulates a strategy whose sampled
     *  rates exceed its own shape ceiling. */
    rateBumpRay?: bigint;
  } = {},
) {
  multicall.mockImplementation(
    async ({
      contracts,
    }: {
      contracts: { functionName: string; args: unknown[] }[];
    }) => {
      if (contracts[0].functionName === "getAssetLiquidity") {
        return [
          opts.totalsRevert
            ? { status: "failure", error: new Error("reverted") }
            : { status: "success", result: totals.liquidity },
          { status: "success", result: [totals.drawn, 0n] },
          { status: "success", result: totals.swept },
          { status: "success", result: totals.deficitRay ?? 0n },
          { status: "success", result: { irStrategy: IRM } },
        ];
      }
      if (contracts[0].functionName === "getInterestRateData") {
        return [
          opts.rateDataRevert
            ? { status: "failure", error: new Error("reverted") }
            : {
                status: "success",
                result: {
                  optimalUsageRatio:
                    opts.optimalUsageOverride ?? PARAMS.optimalUsageBps,
                  baseDrawnRate: PARAMS.baseDrawnRateBps,
                  rateGrowthBeforeOptimal: PARAMS.rateGrowthBeforeOptimalBps,
                  rateGrowthAfterOptimal: PARAMS.rateGrowthAfterOptimalBps,
                },
              },
        ];
      }
      // Round 3: rate at each (liquidity, drawn, swept) tuple.
      return contracts.map((c, i) => {
        if (opts.curveLegRevertAt === i) {
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
          result:
            modelRateRay(liquidity, drawn, swept) + (opts.rateBumpRay ?? 0n),
        };
      });
    },
  );
}

describe("getInterestRateModelCurveSafe", () => {
  beforeEach(() => {
    multicall.mockReset();
  });

  it("samples every leg as a T-invariant split with swept'=0", async () => {
    setupHub({ liquidity: 600n, drawn: 400n, swept: 7n });

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.error).toBeNull();
    expect(out.curve).not.toBeNull();

    const total = 600n + 400n + 7n;
    const curveCall = multicall.mock.calls.find(
      (c) => c[0].contracts[0].functionName === "calculateInterestRate",
    )!;
    const legs = curveCall[0].contracts as { args: readonly bigint[] }[];
    for (const leg of legs) {
      const [, liquidity, drawn, , swept] = leg.args;
      expect(liquidity + drawn).toBe(total);
      expect(swept).toBe(0n);
    }
  });

  it("adds an off-grid kink as its own exact sample, exactly once", async () => {
    // liquidity+drawn+swept = 1000; a 91% kink is not a 5%-spaced point, so
    // the sweep must add drawn' = 910 as an extra leg (and only one).
    setupHub(
      { liquidity: 100n, drawn: 900n, swept: 0n },
      { optimalUsageOverride: 9_100n },
    );

    await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    const curveCall = multicall.mock.calls.find(
      (c) => c[0].contracts[0].functionName === "calculateInterestRate",
    )!;
    const utilizations = (
      curveCall[0].contracts as { args: readonly bigint[] }[]
    ).map((c) => c.args[2]); // drawn' for each leg
    expect(utilizations.filter((d) => d === 910n)).toHaveLength(1);
    // 21 even points + the kink.
    expect(utilizations).toHaveLength(22);
  });

  it("returns the curve sorted ascending by utilization", async () => {
    setupHub({ liquidity: 700n, drawn: 300n, swept: 0n });

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    const utilizations = out.curve!.map((p) => p.utilizationPercent);
    const sorted = [...utilizations].sort((a, b) => a - b);
    expect(utilizations).toEqual(sorted);
    // Strictly ascending: no duplicate sample survives dedup.
    expect(new Set(utilizations).size).toBe(utilizations.length);
  });

  it("nulls the whole result when a curve leg reverts", async () => {
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { curveLegRevertAt: 3 },
    );

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out).toEqual({
      curve: null,
      kinkUtilizationPercent: null,
      maxAprPercent: null,
      error: expect.any(Error),
    });
  });

  it("nulls the whole result when the totals read reverts", async () => {
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { totalsRevert: true },
    );

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.curve).toBeNull();
    expect(out.error).toBeInstanceOf(Error);
    // Only the totals multicall ran; no rate-data or curve multicall.
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("nulls the whole result when getInterestRateData reverts", async () => {
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { rateDataRevert: true },
    );

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.curve).toBeNull();
    expect(out.kinkUtilizationPercent).toBeNull();
    expect(out.error).toBeInstanceOf(Error);
    // No curve multicall issued once the rate-data leg fails.
    expect(multicall).toHaveBeenCalledTimes(2);
  });

  it("never throws on a network-level multicall failure", async () => {
    multicall.mockRejectedValue(new Error("RPC timeout"));

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.curve).toBeNull();
    expect(out.error).toBeInstanceOf(Error);
  });

  it("nulls the whole result when the strategy's optimalUsageRatio exceeds the BPS scale", async () => {
    // A RAY-scaled ratio (nothing at decode time rules it out — the ABI is
    // four bare uint256s) must fail with a named error, not surface as an
    // opaque viem encoding throw from negative sample liquidity.
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { optimalUsageOverride: 9n * 10n ** 26n },
    );

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.curve).toBeNull();
    expect(out.error?.message).toMatch(/optimalUsageRatio/);
    // No curve multicall issued once the kink fails validation.
    expect(multicall).toHaveBeenCalledTimes(2);
  });

  it("raises maxAprPercent to the sampled ceiling when a sample exceeds the shape max", async () => {
    // Nothing forces a strategy to respect base+growthBefore+growthAfter
    // (64% here). +1% on every leg puts the top sample at 65% — the reported
    // ceiling must follow, or the consumer's y domain sits below the curve.
    setupHub(
      { liquidity: 600n, drawn: 400n, swept: 0n },
      { rateBumpRay: RAY / 100n },
    );

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.error).toBeNull();
    expect(out.maxAprPercent).toBeCloseTo(65, 6);
  });

  it("converts BPS to percent for kink and max APR", async () => {
    setupHub({ liquidity: 600n, drawn: 400n, swept: 0n });

    const out = await getInterestRateModelCurveSafe({ hub: HUB, assetId: 5 });

    expect(out.kinkUtilizationPercent).toBeCloseTo(90, 6);
    // base(0%) + growthBefore(4%) + growthAfter(60%) = 64%.
    expect(out.maxAprPercent).toBeCloseTo(64, 6);
  });
});
