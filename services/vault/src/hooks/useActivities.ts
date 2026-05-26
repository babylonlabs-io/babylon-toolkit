import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { useAaveConfig } from "../applications/aave/context";
import {
  ACTIVITIES_QUERY_KEY,
  fetchUserActivities,
  type FetchUserActivitiesDeps,
} from "../services/activity";
import { getTokenByAddress } from "../services/token/tokenService";

/**
 * Hook to fetch user activities for a user.
 *
 * Reads borrow-asset reserves from the AaveConfig context (which fetches
 * them once at app startup) and threads them into the pure fetch function
 * as inputs, so the activity service doesn't have to issue additional
 * GraphQL requests.
 *
 * @param userAddress - User's Ethereum address
 * @returns Query result with activity data sorted by date (newest first)
 */
export function useActivities(userAddress: Address | undefined) {
  const { borrowableReserves, vbtcReserve } = useAaveConfig();

  const deps: FetchUserActivitiesDeps = useMemo(() => {
    const reserves = new Map<
      string,
      { symbol: string; decimals: number; icon: string | undefined }
    >();
    for (const r of borrowableReserves) {
      reserves.set(r.reserveId.toString(), {
        symbol: r.token.symbol,
        decimals: r.token.decimals,
        icon: getTokenByAddress(r.token.address)?.icon,
      });
    }
    if (vbtcReserve) {
      reserves.set(vbtcReserve.reserveId.toString(), {
        symbol: vbtcReserve.token.symbol,
        decimals: vbtcReserve.token.decimals,
        icon: getTokenByAddress(vbtcReserve.token.address)?.icon,
      });
    }

    return { reserves };
  }, [borrowableReserves, vbtcReserve]);

  return useQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, userAddress],
    queryFn: () => fetchUserActivities(userAddress!, deps),
    enabled: !!userAddress,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
