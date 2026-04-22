/**
 * Hook to fetch user activities across all applications
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import {
  getApplication,
  getApplicationMetadataByController,
} from "../applications";
import { AAVE_APP_ID } from "../applications/aave/config";
import { useAaveConfig } from "../applications/aave/context";
import {
  ACTIVITIES_QUERY_KEY,
  fetchUserActivities,
  type FetchUserActivitiesDeps,
} from "../services/activity";
import type { ActivityApplication } from "../types/activityLog";

const UNKNOWN_APP: ActivityApplication = {
  id: "unknown",
  name: "Unknown App",
  logoUrl: "/images/unknown-app.svg",
};

/**
 * Hook to fetch user activities across all enabled applications.
 *
 * Reads borrow-asset reserves and Aave application metadata from the
 * AaveConfig context (which fetches them once at app startup) and threads
 * them into the pure fetch function as inputs, so the activity service
 * doesn't have to issue additional GraphQL requests or reach into the
 * application registry.
 *
 * @param userAddress - User's Ethereum address
 * @returns Query result with activity data sorted by date (newest first)
 */
export function useActivities(userAddress: Address | undefined) {
  const { borrowableReserves, vbtcReserve } = useAaveConfig();

  const deps: FetchUserActivitiesDeps = useMemo(() => {
    const reserves = new Map<string, { symbol: string; decimals: number }>();
    for (const r of borrowableReserves) {
      reserves.set(r.reserveId.toString(), {
        symbol: r.token.symbol,
        decimals: r.token.decimals,
      });
    }
    if (vbtcReserve) {
      reserves.set(vbtcReserve.reserveId.toString(), {
        symbol: vbtcReserve.token.symbol,
        decimals: vbtcReserve.token.decimals,
      });
    }

    const aaveMeta = getApplication(AAVE_APP_ID)?.metadata;
    const borrowAppMetadata: ActivityApplication = aaveMeta
      ? {
          id: aaveMeta.id,
          name: aaveMeta.name,
          logoUrl: aaveMeta.logoUrl,
        }
      : UNKNOWN_APP;

    return {
      reserves,
      borrowAppMetadata,
      resolveVaultApp: (controllerAddress) => {
        const meta = getApplicationMetadataByController(controllerAddress);
        return meta
          ? { id: meta.id, name: meta.name, logoUrl: meta.logoUrl }
          : undefined;
      },
    };
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
