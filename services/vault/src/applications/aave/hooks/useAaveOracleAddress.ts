/** Reads `Spoke.ORACLE()` once per spoke. The on-chain field is `immutable`, so the result is cached forever. */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { getOracleAddress } from "../clients/aaveOracle";

const QUERY_KEY = "aaveOracleAddress";

export interface UseAaveOracleAddressResult {
  oracleAddress: Address | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAaveOracleAddress({
  spokeAddress,
}: {
  spokeAddress: Address | undefined;
}): UseAaveOracleAddressResult {
  const enabled = spokeAddress != null;
  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, spokeAddress],
    queryFn: () => getOracleAddress(spokeAddress!),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    oracleAddress: data ?? null,
    isLoading: enabled ? isLoading : false,
    error: (error as Error | null) ?? null,
  };
}
