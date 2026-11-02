/**
 * The interest fee the adapter charges borrowers on drawn interest, read from
 * the adapter. Null while loading and after a failed read.
 */

import { useQuery } from "@tanstack/react-query";

import { getInterestFeeBps } from "../clients/transaction";
import { getAaveAdapterAddress } from "../config";

const QUERY_KEY = "aaveInterestFeeBps";
const ONE_MINUTE_MS = 60 * 1000;

export function useInterestFeeBps({
  enabled,
}: {
  enabled: boolean;
}): number | null {
  const { data, error } = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => getInterestFeeBps(getAaveAdapterAddress()),
    enabled,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  // Same stale-data guard as useAaveBorrowAprs: clear `data` on error.
  return error ? null : (data ?? null);
}
