/**
 * What our Core Spoke may still draw on each reserve's hub before it hits the
 * hub's draw cap, in whole tokens. A hub's liquidity is shared by every spoke on
 * it, but our spoke may only draw up to its own cap, so the two limits differ.
 *
 * `null` means no cap, or that the read is loading or failed: callers leave the
 * borrow uncapped, the same fallback as a missing liquidity read.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { AAVE_RESERVE_DRAW_HEADROOM_QUERY_KEY as QUERY_KEY } from "@/utils/queryKeys";

import { getSpokeDrawUsagesSafe } from "../clients/aaveHub";
import { useAaveConfig } from "../context";
import type { AaveReserveConfig } from "../services/fetchConfig";
import { getDrawHeadroom } from "../utils/hubState";

const ONE_MINUTE_MS = 60 * 1000;

export interface UseAaveReserveDrawHeadroomResult {
  /** Remaining draw per reserve id; null for no cap, loading or failed. */
  headroomByReserveId: Record<string, number | null>;
}

export function useAaveReserveDrawHeadroom({
  reserves,
}: {
  reserves: AaveReserveConfig[];
}): UseAaveReserveDrawHeadroomResult {
  const { config } = useAaveConfig();
  const spoke = config?.coreSpokeAddress;

  // Keyed by the Hub asset and decimals, like useAaveReserveLiquidity, so a
  // repointed reserve or corrected decimals recompute instead of reusing.
  const reserveAssetsKey = useMemo(
    () =>
      reserves
        .map(
          (r) =>
            `${r.reserveId.toString()}:${r.reserve.hub.toLowerCase()}:${r.reserve.assetId}:${r.reserve.decimals}`,
        )
        .sort()
        .join(","),
    [reserves],
  );

  const { data, error } = useQuery({
    queryKey: [QUERY_KEY, spoke?.toLowerCase(), reserveAssetsKey],
    queryFn: async () => {
      const results = await getSpokeDrawUsagesSafe(
        spoke!,
        reserves.map((r) => ({
          hub: r.reserve.hub,
          assetId: r.reserve.assetId,
        })),
      );
      const out: Record<string, number | null> = {};
      results.forEach((usage, i) => {
        const reserve = reserves[i];
        // The Hub scales the cap by the Hub asset's decimals.
        out[reserve.reserveId.toString()] = getDrawHeadroom(
          usage,
          reserve.reserve.decimals,
        );
      });
      return out;
    },
    enabled: reserves.length > 0 && spoke != null,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  return { headroomByReserveId: error ? {} : (data ?? {}) };
}
