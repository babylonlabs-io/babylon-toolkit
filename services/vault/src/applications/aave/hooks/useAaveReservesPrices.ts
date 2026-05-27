/** Batched per-reserve safe oracle read for asset lists. Returns `Record<reserveId.toString(), number | null>`. */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { getReservesPricesSafe } from "../clients/aaveOracle";

import { useAaveOracleAddress } from "./useAaveOracleAddress";

const ORACLE_SCALE = 1e8;
const QUERY_KEY = "aaveReservesPrices";
const ONE_MINUTE_MS = 60 * 1000;

export interface UseAaveReservesPricesResult {
  pricesByReserveId: Record<string, number | null>;
  isLoading: boolean;
  error: Error | null;
}

export function useAaveReservesPrices({
  spokeAddress,
  reserveIds,
}: {
  spokeAddress: Address | undefined;
  reserveIds: bigint[];
}): UseAaveReservesPricesResult {
  const {
    oracleAddress,
    isLoading: oracleLoading,
    error: oracleError,
  } = useAaveOracleAddress({ spokeAddress });

  // Sort + stringify for a stable cache key regardless of input order.
  const reserveIdsKey = useMemo(
    () =>
      [...reserveIds]
        .map((id) => id.toString())
        .sort()
        .join(","),
    [reserveIds],
  );

  const priceEnabled = oracleAddress != null && reserveIds.length > 0;
  const {
    data,
    isLoading: priceLoading,
    error: priceError,
  } = useQuery({
    queryKey: [QUERY_KEY, oracleAddress, reserveIdsKey],
    queryFn: async () => {
      const results = await getReservesPricesSafe(oracleAddress!, reserveIds);
      const out: Record<string, number | null> = {};
      for (const r of results) {
        out[r.reserveId.toString()] =
          r.priceRaw == null ? null : Number(r.priceRaw) / ORACLE_SCALE;
      }
      return out;
    },
    enabled: priceEnabled,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  // Same stale-data guard as useAaveReservePrice: clear `data` when error is set.
  const upstreamRequested = spokeAddress != null && reserveIds.length > 0;
  const error = oracleError ?? (priceError as Error | null) ?? null;
  return {
    pricesByReserveId: error ? {} : (data ?? {}),
    isLoading: upstreamRequested && (oracleLoading || priceLoading),
    error,
  };
}
