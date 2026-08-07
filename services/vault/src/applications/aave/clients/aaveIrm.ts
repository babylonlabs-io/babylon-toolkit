/**
 * Interest-rate-model (IRM) curve for one Hub asset's on-chain kinked
 * strategy — the data source for the C2 borrow-rate chart.
 *
 * The curve is piecewise-linear in utilization with a single breakpoint (the
 * kink), so sampling only needs: 21 evenly-spaced points (0%, 5%, …, 100%)
 * plus the exact kink and exact live-utilization points. With the breakpoint
 * itself an exact sample, linear interpolation between samples reproduces the
 * true on-chain curve exactly — no off-chain reimplementation of the rate
 * math, same stance as `getProjectedBorrowAprPercentsSafe`.
 *
 * Sampling exploits that `T = liquidity + drawn + swept` is invariant: for a
 * synthetic sample at utilization `u`, `drawn' = T·u`, `liquidity' = T − drawn'`,
 * `swept' = 0` folds the sweep into liquidity without changing `T`. The one
 * exception is the live-utilization sample, which passes the untouched
 * `(liquidity, drawn, swept)` so it is bit-identical to the Hub's own
 * `getAssetDrawnRate`.
 */

import type { Abi, Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

import {
  IR_STRATEGY_ABI,
  rateRayToPercent,
  readHubAssetTotalsSafe,
} from "./aaveHub";

/** Utilization sampling step in BPS: 21 even points from 0% to 100%. */
const IRM_SAMPLE_STEP_BPS = 500;
/** 100% expressed in basis points. */
const BPS_SCALE = 10_000n;
/** BPS per whole percentage point (1% = 100 BPS). */
const BPS_PER_PERCENT = 100;

const IRM_CURVE_DATA_ABI = [
  {
    type: "function",
    name: "getInterestRateData",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "optimalUsageRatio", type: "uint256" },
          { name: "baseDrawnRate", type: "uint256" },
          { name: "rateGrowthBeforeOptimal", type: "uint256" },
          { name: "rateGrowthAfterOptimal", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/** Identifies one Hub asset to read the interest-rate-model curve for. */
export interface InterestRateModelCurveRequest {
  /** Hub contract address (from the reserve's `hub` field). */
  hub: Address;
  /** Asset identifier on that Hub (from the reserve's `assetId` field). */
  assetId: number;
}

export interface IrmCurvePoint {
  /** Utilization in percent, 0–100. */
  utilizationPercent: number;
  /** Borrow APR percent at that utilization, from the on-chain strategy. */
  aprPercent: number;
}

export interface InterestRateModelCurveResult {
  /** Sorted by utilization; null when any leg failed (no half-curve). */
  curve: IrmCurvePoint[] | null;
  /** Kink utilization percent from getInterestRateData, or null. */
  kinkUtilizationPercent: number | null;
  /** Live utilization percent (drawn / (liquidity+drawn+swept)), or null. */
  currentUtilizationPercent: number | null;
  /** APR at the live totals — bit-identical to the Hub's getAssetDrawnRate. */
  currentAprPercent: number | null;
  /**
   * The y-axis ceiling, percent: base+growthBefore+growthAfter, raised to the
   * highest sampled APR when the live deficit pushes the curve above it.
   */
  maxAprPercent: number | null;
  error: Error | null;
}

const NULL_CURVE_RESULT: Omit<InterestRateModelCurveResult, "error"> = {
  curve: null,
  kinkUtilizationPercent: null,
  currentUtilizationPercent: null,
  currentAprPercent: null,
  maxAprPercent: null,
};

/**
 * Reads the on-chain IRM curve for one Hub asset in three sequential
 * multicalls: (1) Hub totals + strategy address, (2) the strategy's
 * `getInterestRateData` for the kink and max-rate shape, (3) `calculateInterestRate`
 * for every sample utilization. Every read is fault-isolated with
 * `allowFailure: true`; any failed leg (or a network-level throw) nulls the
 * whole result rather than a half-curve, since a caller can't chart a
 * partially-sampled strategy.
 */
export async function getInterestRateModelCurveSafe({
  hub,
  assetId,
}: InterestRateModelCurveRequest): Promise<InterestRateModelCurveResult> {
  const publicClient = ethClient.getPublicClient();
  const assetIdArg = BigInt(assetId);

  const totalsRead = await readHubAssetTotalsSafe(hub, assetIdArg);
  if (totalsRead.totals === null) {
    return { ...NULL_CURVE_RESULT, error: totalsRead.error };
  }
  const { liquidity, drawn, swept, deficit, irStrategy } = totalsRead.totals;

  // The denominator the Hub feeds its rate strategy; invariant across the
  // whole sampling sweep (see module doc).
  const totalLiquidity = liquidity + drawn + swept;
  if (totalLiquidity === 0n) {
    return {
      ...NULL_CURVE_RESULT,
      error: new Error("Reserve has no supplied liquidity"),
    };
  }
  const currentBps = (drawn * BPS_SCALE) / totalLiquidity;

  let curveData;
  try {
    curveData = await publicClient.multicall({
      contracts: [
        {
          address: irStrategy,
          abi: IRM_CURVE_DATA_ABI as Abi,
          functionName: "getInterestRateData" as const,
          args: [assetIdArg] as const,
        },
      ],
      allowFailure: true,
    });
  } catch (err) {
    return {
      ...NULL_CURVE_RESULT,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  const [rateDataCall] = curveData;
  if (rateDataCall.status !== "success") {
    return {
      ...NULL_CURVE_RESULT,
      error: new Error("Interest-rate strategy data read reverted"),
    };
  }

  const {
    optimalUsageRatio,
    baseDrawnRate,
    rateGrowthBeforeOptimal,
    rateGrowthAfterOptimal,
  } = rateDataCall.result as {
    optimalUsageRatio: bigint;
    baseDrawnRate: bigint;
    rateGrowthBeforeOptimal: bigint;
    rateGrowthAfterOptimal: bigint;
  };

  const kinkBps = optimalUsageRatio;
  // The ABI declares four bare uint256s, so nothing at decode time rules out
  // a strategy returning the ratio on another scale (e.g. RAY). Unchecked,
  // an oversized kink makes `sampleLiquidity` below go negative and surfaces
  // as an opaque viem encoding throw from inside the multicall.
  if (kinkBps > BPS_SCALE) {
    return {
      ...NULL_CURVE_RESULT,
      error: new Error(
        `Strategy optimalUsageRatio ${kinkBps.toString()} exceeds the BPS scale (${BPS_SCALE.toString()})`,
      ),
    };
  }
  const shapeMaxAprPercent =
    Number(baseDrawnRate + rateGrowthBeforeOptimal + rateGrowthAfterOptimal) /
    BPS_PER_PERCENT;

  // Sample set: 21 even points ∪ { kink, current }, deduplicated and sorted.
  const sampleBpsSet = new Set<bigint>();
  for (let bps = 0n; bps <= BPS_SCALE; bps += BigInt(IRM_SAMPLE_STEP_BPS)) {
    sampleBpsSet.add(bps);
  }
  sampleBpsSet.add(kinkBps);
  sampleBpsSet.add(currentBps);
  const sortedSampleBps = [...sampleBpsSet].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  let rateLegs;
  try {
    rateLegs = await publicClient.multicall({
      contracts: sortedSampleBps.map((bps) => {
        const isCurrent = bps === currentBps;
        const sampleDrawn = isCurrent
          ? drawn
          : (totalLiquidity * bps) / BPS_SCALE;
        const sampleLiquidity = isCurrent
          ? liquidity
          : totalLiquidity - sampleDrawn;
        const sampleSwept = isCurrent ? swept : 0n;
        return {
          address: irStrategy,
          abi: IR_STRATEGY_ABI as Abi,
          functionName: "calculateInterestRate" as const,
          args: [
            assetIdArg,
            sampleLiquidity,
            sampleDrawn,
            deficit,
            sampleSwept,
          ] as const,
        };
      }),
      allowFailure: true,
    });
  } catch (err) {
    return {
      ...NULL_CURVE_RESULT,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  const failedLeg = rateLegs.find((leg) => leg.status !== "success");
  if (failedLeg) {
    return {
      ...NULL_CURVE_RESULT,
      error: new Error("Interest-rate strategy curve read reverted"),
    };
  }

  const curve: IrmCurvePoint[] = sortedSampleBps.map((bps, i) => ({
    utilizationPercent: Number(bps) / BPS_PER_PERCENT,
    aprPercent: rateRayToPercent(rateLegs[i].result as bigint),
  }));

  const currentIndex = sortedSampleBps.findIndex((bps) => bps === currentBps);

  return {
    curve,
    kinkUtilizationPercent: Number(kinkBps) / BPS_PER_PERCENT,
    currentUtilizationPercent: Number(currentBps) / BPS_PER_PERCENT,
    currentAprPercent: curve[currentIndex].aprPercent,
    // The shape ceiling ignores the reserve's live deficit, which every
    // sampled leg carries — clamp so the consumer's y domain can never sit
    // below a sampled point (the chart SVG is overflow: visible).
    maxAprPercent: Math.max(
      shapeMaxAprPercent,
      ...curve.map((point) => point.aprPercent),
    ),
    error: null,
  };
}
