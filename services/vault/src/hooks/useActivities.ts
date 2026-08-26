import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { useAaveConfig } from "../applications/aave/context";
import {
  ACTIVITIES_QUERY_KEY,
  fetchUserActivities,
  type FetchUserActivitiesDeps,
} from "../services/activity";
import {
  getTokenByAddress,
  getTokenIconBySymbol,
} from "../services/token/tokenService";

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
    const allReserves = vbtcReserve
      ? [...borrowableReserves, vbtcReserve]
      : borrowableReserves;
    const reserves = new Map(
      allReserves.map((r) => [
        r.reserveId.toString(),
        {
          symbol: r.token.symbol,
          decimals: r.token.decimals,
          // Address-based lookup first (precise per-deployment), then fall back
          // to symbol-based lookup so generic stablecoins (USDC/USDT/etc.) get
          // an icon even on testnets whose contract addresses aren't in the
          // canonical TOKEN_REGISTRY.
          icon:
            getTokenByAddress(r.token.address)?.icon ??
            getTokenIconBySymbol(r.token.symbol),
        },
      ]),
    );
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
