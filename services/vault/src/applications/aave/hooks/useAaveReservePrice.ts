/**
 * Single-reserve USD price from the Aave on-chain oracle (the source of
 * liquidation truth). Returns `priceUsd: null` on revert; do not substitute.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { getReservesPrices } from "../clients/aaveOracle";

import { useAaveOracleAddress } from "./useAaveOracleAddress";

/** Aave oracle base unit (Spoke.ORACLE_DECIMALS = 8). */
const ORACLE_SCALE = 1e8;
const QUERY_KEY = "aaveReservePrice";
const ONE_MINUTE_MS = 60 * 1000;

export interface UseAaveReservePriceResult {
  priceUsd: number | null;
  isLoading: boolean;
  /**
   * True while `priceUsd` is still the previously-selected reserve's price,
   * carried over (via `keepPreviousData`) so switching assets does not unmount
   * the borrow form. Consumers must not treat the price — or any value derived
   * from it (max borrow, available liquidity) — as belonging to the current
   * reserve until this clears.
   */
  isPriceStale: boolean;
  error: Error | null;
}

export function useAaveReservePrice({
  spokeAddress,
  reserveId,
}: {
  spokeAddress: Address | undefined;
  reserveId: bigint | undefined;
}): UseAaveReservePriceResult {
  const {
    oracleAddress,
    isLoading: oracleLoading,
    error: oracleError,
  } = useAaveOracleAddress({ spokeAddress });

  const priceEnabled = oracleAddress != null && reserveId != null;
  const {
    data,
    isLoading: priceLoading,
    isPlaceholderData,
    error: priceError,
  } = useQuery({
    queryKey: [
      QUERY_KEY,
      oracleAddress,
      reserveId == null ? null : reserveId.toString(),
    ],
    queryFn: async () => {
      const [raw] = await getReservesPrices(oracleAddress!, [reserveId!]);
      return Number(raw) / ORACLE_SCALE;
    },
    enabled: priceEnabled,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
    // Keep the prior reserve's price on screen while the new one loads so the
    // borrow form stays mounted on asset switch (no flash/remount). The stale
    // window is surfaced via `isPriceStale` so consumers can withhold
    // price-derived figures until the fresh value lands.
    placeholderData: keepPreviousData,
  });

  // Propagate oracle-address loading/error up; price query is disabled until address resolves.
  // When a refetch fails React Query keeps the last successful `data`; clear it so consumers
  // don't display stale price next to a fresh error.
  const upstreamRequested = spokeAddress != null && reserveId != null;
  const error = oracleError ?? (priceError as Error | null) ?? null;
  return {
    priceUsd: error ? null : (data ?? null),
    isLoading: upstreamRequested && (oracleLoading || priceLoading),
    isPriceStale: isPlaceholderData,
    error,
  };
}
