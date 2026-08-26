/** Vault-side access to the Aave v4 Hub reads. */

import {
  getAssetDrawnRatesSafe as sdkGetAssetDrawnRatesSafe,
  type AssetDrawnRateRequest,
  type AssetDrawnRateResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Abi, Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

export async function getAssetDrawnRatesSafe(
  requests: AssetDrawnRateRequest[],
): Promise<AssetDrawnRateResult[]> {
  return sdkGetAssetDrawnRatesSafe(ethClient.getPublicClient(), requests);
}

export type { AssetDrawnRateRequest, AssetDrawnRateResult };

/** RAY fixed-point scale Aave uses for rates (1e27 = 100%). */
const RAY = 10n ** 27n;
const PERCENT_SCALE = 100;

/** Converts a RAY-scaled rate to a percent number (e.g. 3.7 for 3.7%). */
export function rateRayToPercent(rateRay: bigint): number {
  return (Number(rateRay) / Number(RAY)) * PERCENT_SCALE;
}

/** Ceil-divides a RAY-scaled value down to asset units (Aave's `fromRayUp`). */
function ceilDivRay(valueRay: bigint): bigint {
  return (valueRay + RAY - 1n) / RAY;
}

/**
 * Minimal Hub ABI for the two reserve-total reads. The SDK's `AaveHub.abi.json`
 * is the rate-read subset (`getAssetDrawnRate` only), so — matching the
 * cap-policy reader's self-contained-fragment pattern — the liquidity reads are
 * kept app-side rather than widening the shared SDK ABI for one display surface.
 */
const HUB_LIQUIDITY_ABI = [
  {
    type: "function",
    name: "getAssetLiquidity",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetOwed",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [
      { name: "drawn", type: "uint256" },
      { name: "premium", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getAssetSwept",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Minimal Hub + interest-rate-strategy ABI for the projected-rate read. The
 * SDK's `AaveHub.abi.json` is the rate-read subset (`getAssetDrawnRate` only),
 * so — matching the cap-policy reader's self-contained-fragment pattern — these
 * reads are kept app-side rather than widening the shared SDK ABI for one
 * display surface.
 *
 * The Hub feeds the strategy the same totals it uses on-chain
 * (`AssetLogic.getDrawnRate`): `getAssetOwed` returns `[drawn, premium]` and
 * the curve's utilization is `drawn / (liquidity + drawn + swept)`. The
 * strategy address comes from `getAssetConfig`.
 */
const HUB_RATE_ABI = [
  {
    type: "function",
    name: "getAssetLiquidity",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetOwed",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [
      { name: "drawn", type: "uint256" },
      { name: "premium", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getAssetSwept",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetDeficitRay",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetConfig",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "feeReceiver", type: "address" },
          { name: "liquidityFee", type: "uint16" },
          { name: "irStrategy", type: "address" },
          { name: "reinvestmentController", type: "address" },
        ],
      },
    ],
  },
] as const;

const IR_STRATEGY_ABI = [
  {
    type: "function",
    name: "calculateInterestRate",
    stateMutability: "view",
    inputs: [
      { name: "assetId", type: "uint256" },
      { name: "liquidity", type: "uint256" },
      { name: "drawn", type: "uint256" },
      { name: "deficit", type: "uint256" },
      { name: "swept", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** The totals snapshot the Hub feeds its rate strategy, plus the strategy address. */
interface HubAssetTotals {
  liquidity: bigint;
  /** getAssetOwed[0] — the strategy curve uses `drawn`; the premium is ignored. */
  drawn: bigint;
  swept: bigint;
  /**
   * Deficit in asset units. The Hub stores it RAY-scaled and feeds
   * `deficitRay.fromRayUp()` (ceil-divide by RAY) into the rate call.
   */
  deficit: bigint;
  irStrategy: Address;
}

type HubAssetTotalsResult =
  | { totals: HubAssetTotals; error: null }
  | { totals: null; error: Error };

/**
 * One multicall reading the exact figures the Hub itself hands its
 * interest-rate strategy: liquidity, drawn, swept, deficit and the strategy
 * address. Shared by `getProjectedBorrowAprPercentsSafe` and the IRM curve
 * reader (aaveIrm.ts) so both rate computations provably start from the same
 * denominator. Reads are isolated with `allowFailure`; any revert or
 * network-level throw comes back as an error rather than a throw.
 */
async function readHubAssetTotalsSafe(
  hub: Address,
  assetIdArg: bigint,
): Promise<HubAssetTotalsResult> {
  const publicClient = ethClient.getPublicClient();

  let totals;
  try {
    totals = await publicClient.multicall({
      contracts: [
        {
          address: hub,
          abi: HUB_RATE_ABI as Abi,
          functionName: "getAssetLiquidity" as const,
          args: [assetIdArg] as const,
        },
        {
          address: hub,
          abi: HUB_RATE_ABI as Abi,
          functionName: "getAssetOwed" as const,
          args: [assetIdArg] as const,
        },
        {
          address: hub,
          abi: HUB_RATE_ABI as Abi,
          functionName: "getAssetSwept" as const,
          args: [assetIdArg] as const,
        },
        {
          address: hub,
          abi: HUB_RATE_ABI as Abi,
          functionName: "getAssetDeficitRay" as const,
          args: [assetIdArg] as const,
        },
        {
          address: hub,
          abi: HUB_RATE_ABI as Abi,
          functionName: "getAssetConfig" as const,
          args: [assetIdArg] as const,
        },
      ],
      allowFailure: true,
    });
  } catch (err) {
    return {
      totals: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  const [liquidityCall, owedCall, sweptCall, deficitCall, configCall] = totals;
  if (
    liquidityCall.status !== "success" ||
    owedCall.status !== "success" ||
    sweptCall.status !== "success" ||
    deficitCall.status !== "success" ||
    configCall.status !== "success"
  ) {
    return {
      totals: null,
      error: new Error("Hub asset totals read reverted"),
    };
  }

  const { irStrategy } = configCall.result as { irStrategy: Address };
  return {
    totals: {
      liquidity: liquidityCall.result as bigint,
      drawn: (owedCall.result as readonly bigint[])[0],
      swept: sweptCall.result as bigint,
      deficit: ceilDivRay(deficitCall.result as bigint),
      irStrategy,
    },
    error: null,
  };
}

/** Identifies one Hub asset to read reserve totals for. */
export interface AssetLiquidityRequest {
  /** Hub contract address (from the reserve's `hub` field). */
  hub: Address;
  /** Asset identifier on that Hub (from the reserve's `assetId` field). */
  assetId: number;
}

export interface AssetLiquidityResult {
  hub: Address;
  assetId: number;
  /** `getAssetLiquidity` — borrowable liquidity remaining (token units). */
  availableLiquidityRaw: bigint | null;
  /** `getAssetOwed[0]` — principal drawn (token units). */
  drawnRaw: bigint | null;
  /** `getAssetOwed[1]` — accrued premium (token units). */
  premiumRaw: bigint | null;
  /** `getAssetSwept` — supplied capital moved into reinvestment (token units). */
  sweptRaw: bigint | null;
  error: Error | null;
}

/** Hub reads per asset: liquidity, owed (drawn + premium), swept. */
const LIQUIDITY_LEGS_PER_ASSET = 3;

/**
 * Per-asset isolated read of the reserve totals the display surfaces derive
 * from (one bad asset ≠ whole list blank). One multicall round-trip issues
 * `getAssetLiquidity` + `getAssetOwed` + `getAssetSwept` per asset with
 * `allowFailure: true`.
 *
 * `swept` is read because it belongs in the utilization denominator: the Hub
 * feeds the strategy `drawn / (liquidity + drawn + swept)` (see HUB_RATE_ABI),
 * so omitting it would make the displayed utilization disagree with both the
 * projected rate this app already computes and the indexer's snapshot series.
 *
 * Every leg is required to derive the figures, so if any reverts the asset is
 * nulled whole (no half-read figure). A network-level multicall failure marks
 * every asset failed rather than throwing — callers (display hooks) rely on
 * always getting a per-asset result array.
 */
export async function getAssetLiquiditiesSafe(
  requests: AssetLiquidityRequest[],
): Promise<AssetLiquidityResult[]> {
  if (requests.length === 0) return [];

  const publicClient = ethClient.getPublicClient();

  const nulled = (hub: Address, assetId: number, error: Error) => ({
    hub,
    assetId,
    availableLiquidityRaw: null,
    drawnRaw: null,
    premiumRaw: null,
    sweptRaw: null,
    error,
  });

  let results;
  try {
    results = await publicClient.multicall({
      contracts: requests.flatMap(({ hub, assetId }) => [
        {
          address: hub,
          abi: HUB_LIQUIDITY_ABI as Abi,
          functionName: "getAssetLiquidity" as const,
          args: [BigInt(assetId)] as const,
        },
        {
          address: hub,
          abi: HUB_LIQUIDITY_ABI as Abi,
          functionName: "getAssetOwed" as const,
          args: [BigInt(assetId)] as const,
        },
        {
          address: hub,
          abi: HUB_LIQUIDITY_ABI as Abi,
          functionName: "getAssetSwept" as const,
          args: [BigInt(assetId)] as const,
        },
      ]),
      allowFailure: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return requests.map(({ hub, assetId }) => nulled(hub, assetId, error));
  }

  return requests.map(({ hub, assetId }, i): AssetLiquidityResult => {
    const base = i * LIQUIDITY_LEGS_PER_ASSET;
    const legs = [results[base], results[base + 1], results[base + 2]];
    const failedLeg = legs.find((leg) => leg.status !== "success");
    if (failedLeg) {
      const failed = failedLeg.error;
      return nulled(
        hub,
        assetId,
        failed instanceof Error
          ? failed
          : new Error(String(failed ?? "Hub reserve-total read reverted")),
      );
    }
    const [drawn, premium] = legs[1].result as readonly [bigint, bigint];
    return {
      hub,
      assetId,
      availableLiquidityRaw: legs[0].result as bigint,
      drawnRaw: drawn,
      premiumRaw: premium,
      sweptRaw: legs[2].result as bigint,
      error: null,
    };
  });
}

/** Identifies one Hub asset and the borrow size to project the rate for. */
export interface ProjectedBorrowAprRequest {
  /** Hub contract address (from the reserve's `hub` field). */
  hub: Address;
  /** Asset identifier on that Hub (from the reserve's `assetId` field). */
  assetId: number;
  /**
   * Borrow amount in the asset's smallest units (raw, decimals already
   * applied). Drawing this amount moves it from `liquidity` into `drawn`,
   * raising utilization and so the rate. `0n` yields `projectedPercent`
   * equal to `currentPercent`.
   */
  borrowAmountRaw: bigint;
}

export interface ProjectedBorrowAprResult {
  /** Current borrow APR percent at the live utilization, or null on revert. */
  currentPercent: number | null;
  /**
   * Borrow APR percent at the post-borrow utilization, or null on revert.
   * Never below `currentPercent`: borrowing only raises utilization.
   */
  projectedPercent: number | null;
  error: Error | null;
}

const NULL_PROJECTION = {
  currentPercent: null,
  projectedPercent: null,
} as const;

/**
 * Computes the current and post-borrow borrow APR for one Hub asset using the
 * asset's on-chain interest-rate strategy — no off-chain reimplementation of
 * the rate curve. The rate is a pure function of the asset totals the Hub
 * itself feeds the strategy:
 *
 *   rate = irStrategy.calculateInterestRate(assetId, liquidity, drawn, _, swept)
 *   utilization = drawn / (liquidity + drawn + swept)
 *
 * The current-rate leg is bit-identical to the Hub's own `getAssetDrawnRate`
 * (Aave v4 `AssetLogic.getDrawnRate` calls the same strategy with these exact
 * totals), so it matches the rate shown by the landing card and asset-selection
 * modal. Both endpoints are read from one totals snapshot fed to the same
 * strategy view, so the current -> projected delta stays exact and monotonic
 * regardless of block skew. A new borrow of `borrowAmountRaw` moves that
 * amount from `liquidity` to `drawn`; `deficit` is passed through to both calls
 * exactly as the Hub feeds it (a borrow doesn't change it), so the figures match
 * the Hub even for a strategy that uses deficit or an asset with bad debt. Reads
 * are isolated with `allowFailure`: any revert (e.g. an asset with no strategy
 * configured) returns nulls rather than throwing, since callers are display
 * surfaces that fall back to a placeholder.
 */
export async function getProjectedBorrowAprPercentsSafe({
  hub,
  assetId,
  borrowAmountRaw,
}: ProjectedBorrowAprRequest): Promise<ProjectedBorrowAprResult> {
  const publicClient = ethClient.getPublicClient();
  const assetIdArg = BigInt(assetId);

  const totalsRead = await readHubAssetTotalsSafe(hub, assetIdArg);
  if (totalsRead.totals === null) {
    return { ...NULL_PROJECTION, error: totalsRead.error };
  }
  const { liquidity, drawn, swept, deficit, irStrategy } = totalsRead.totals;

  // Borrowing moves the drawn amount out of liquidity, so the denominator
  // (liquidity + drawn + swept) is invariant. A borrow can't exceed available
  // liquidity, so cap the moved amount at `liquidity`: an oversized entry
  // saturates the projection at draining the reserve rather than inventing
  // liquidity (which would inflate the denominator and understate the rate).
  const effectiveBorrowRaw =
    borrowAmountRaw > liquidity ? liquidity : borrowAmountRaw;
  const projectedLiquidity = liquidity - effectiveBorrowRaw;
  const projectedDrawn = drawn + effectiveBorrowRaw;

  let rates;
  try {
    rates = await publicClient.multicall({
      contracts: [
        {
          address: irStrategy,
          abi: IR_STRATEGY_ABI as Abi,
          functionName: "calculateInterestRate" as const,
          args: [assetIdArg, liquidity, drawn, deficit, swept] as const,
        },
        {
          address: irStrategy,
          abi: IR_STRATEGY_ABI as Abi,
          functionName: "calculateInterestRate" as const,
          args: [
            assetIdArg,
            projectedLiquidity,
            projectedDrawn,
            deficit,
            swept,
          ] as const,
        },
      ],
      allowFailure: true,
    });
  } catch (err) {
    return {
      ...NULL_PROJECTION,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  const [currentCall, projectedCall] = rates;
  return {
    currentPercent:
      currentCall.status === "success"
        ? rateRayToPercent(currentCall.result as bigint)
        : null,
    projectedPercent:
      projectedCall.status === "success"
        ? rateRayToPercent(projectedCall.result as bigint)
        : null,
    error: null,
  };
}
