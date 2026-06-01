/**
 * Shared subscription to the vault-provider-proxy `/vp-health` endpoint.
 *
 * Both {@link useUnhealthyVps} and {@link useDisabledVps} derive their sets
 * from this single query. Centralizing the query (same `["vpHealth"]` key,
 * same poll interval) guarantees the two hooks share one cache entry and one
 * network fetch rather than polling the endpoint twice.
 */

import { useQuery } from "@tanstack/react-query";

import { fetchVpHealth } from "../services/vpHealth";
import type { VpHealthSnapshot } from "../types/vpHealth";

/** Poll interval for the health endpoint. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Returns the latest VP health snapshots, or `undefined` until the first
 * fetch resolves. `fetchVpHealth` returns `[]` on any failure (graceful
 * degradation), so a resolved-but-empty array means "assume all VPs healthy
 * and enabled".
 */
export function useVpHealthSnapshots(): VpHealthSnapshot[] | undefined {
  const { data } = useQuery<VpHealthSnapshot[]>({
    queryKey: ["vpHealth"],
    queryFn: fetchVpHealth,
    refetchInterval: POLL_INTERVAL_MS,
    // fetchVpHealth swallows failures into [], so a retry would never see a
    // thrown error; disable it to keep the polling cadence predictable.
    retry: false,
    refetchOnWindowFocus: false,
  });

  return data;
}
