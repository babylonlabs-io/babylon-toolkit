/**
 * Hook to fetch user activities across all applications
 */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import {
  ACTIVITIES_QUERY_KEY,
  fetchUserActivities,
} from "../services/activity";

/**
 * Hook to fetch user activities across all enabled applications
 *
 * @param userAddress - User's Ethereum address
 * @returns Query result with activity data sorted by date (newest first)
 */
export function useActivities(userAddress: Address | undefined) {
  return useQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, userAddress],
    queryFn: () => fetchUserActivities(userAddress!),
    enabled: !!userAddress,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
