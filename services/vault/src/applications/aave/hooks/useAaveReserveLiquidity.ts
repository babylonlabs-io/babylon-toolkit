/**
 * Batched per-reserve liquidity read from the Aave v4 Hub. Returns
 * `Record<reserveId.toString(), ReserveLiquidity | null>` with available
 * liquidity in token units and utilization in basis points. A reserve is
 * `null` when its read failed (callers render the empty placeholder).
 *
 * Read from the Hub (keyed by `hub`/`assetId`), not the Spoke: the Core Spoke
 * supplies vBTC collateral, not the borrowed asset, so its reserve totals are
 * spoke-local. The Hub holds the shared market — the same place the borrow APR
 * is read — so utilization here stays consistent with the displayed rate.
 *
 * Wallet-less: reads go through the app's public RPC client, so this works on
 * disconnected surfaces (e.g. the asset picker).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { getAssetLiquiditiesSafe } from "../clients/aaveHub";
import type { AaveReserveConfig } from "../services/fetchConfig";

const QUERY_KEY = "aaveReserveLiquidity";
const ONE_MINUTE_MS = 60 * 1000;
/** 100% expressed in basis points (1 bps = 0.01%). */
const BPS_SCALE = 10_000n;

export interface ReserveLiquidity {
  /**
   * Borrowable liquidity remaining, in whole token units. Consumed for compact
   * display and for projecting the post-borrow figure (`available - amount`),
   * so a `number` is the convenient form; the compact display rounds anyway, so
   * the `Number()` conversion's loss of sub-display precision is immaterial.
   */
  availableLiquidity: number;
  /**
   * Utilization (borrowed / supplied) in basis points, or null when the
   * reserve has no supplied liquidity (utilization is undefined at 0 supply).
   */
  utilizationBps: number | null;
}

export interface UseAaveReserveLiquidityResult {
  /** Liquidity per reserve ID; null when that reserve's read failed. */
  liquidityByReserveId: Record<string, ReserveLiquidity | null>;
  isLoading: boolean;
  error: Error | null;
}

export function useAaveReserveLiquidity({
  reserves,
}: {
  reserves: AaveReserveConfig[];
}): UseAaveReserveLiquidityResult {
  // Stable cache key regardless of input order. Includes the Hub asset
  // (`hub`/`assetId`) each total is read from, not just the reserve ID, so a
  // config refresh that repoints a reserve busts the cache instead of serving
  // totals fetched for the old asset. Also includes `decimals`, since the
  // cached value is token-unit-converted with it — a corrected decimal must
  // recompute rather than reuse the old conversion.
  const reserveAssetsKey = useMemo(
    () =>
      reserves
        .map(
          (r) =>
            `${r.reserveId.toString()}:${r.reserve.hub.toLowerCase()}:${r.reserve.assetId}:${r.token.decimals}`,
        )
        .sort()
        .join(","),
    [reserves],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, reserveAssetsKey],
    queryFn: async () => {
      const results = await getAssetLiquiditiesSafe(
        reserves.map((r) => ({
          hub: r.reserve.hub,
          assetId: r.reserve.assetId,
        })),
      );
      const out: Record<string, ReserveLiquidity | null> = {};
      results.forEach((result, i) => {
        const reserve = reserves[i];
        const key = reserve.reserveId.toString();
        const { availableLiquidityRaw, totalOwedRaw } = result;
        if (availableLiquidityRaw == null || totalOwedRaw == null) {
          out[key] = null;
          return;
        }
        const suppliedRaw = availableLiquidityRaw + totalOwedRaw;
        out[key] = {
          // The Hub reports liquidity and owed in the reserve's underlying-token
          // base units, so convert with the token's decimals — the same scale
          // the borrow amount and the rest of the borrow flow already use.
          availableLiquidity: Number(
            formatUnits(availableLiquidityRaw, reserve.token.decimals),
          ),
          // Utilization stays in bigint until the final ratio so a large
          // supplied total can't overflow the intermediate product.
          utilizationBps:
            suppliedRaw === 0n
              ? null
              : Number((totalOwedRaw * BPS_SCALE) / suppliedRaw),
        };
      });
      return out;
    },
    enabled: reserves.length > 0,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  // Same stale-data guard as useAaveBorrowAprs: clear `data` on error.
  return {
    liquidityByReserveId: error ? {} : (data ?? {}),
    isLoading: reserves.length > 0 && isLoading,
    error: (error as Error | null) ?? null,
  };
}
