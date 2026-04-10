/**
 * Hook that periodically polls the VP proxy health endpoint and maintains
 * a set of unhealthy vault provider addresses.
 *
 * Design decisions:
 * - A VP is "unhealthy" when it appears in the health response with a
 *   success rate below {@link SUCCESS_RATE_THRESHOLD} AND has at least
 *   {@link MIN_REQUESTS_FOR_EVALUATION} requests (to avoid flagging VPs
 *   based on a single fluke failure).
 * - VPs absent from the response had no recent proxy traffic and are
 *   assumed healthy.
 * - On fetch error (5xx, network failure) the hook returns an empty set
 *   so all VPs remain visible (graceful degradation).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchVpHealth } from "../services/vpHealth";
import type { VpHealthSnapshot } from "../types/vpHealth";

/** Poll interval for the health endpoint */
const POLL_INTERVAL_MS = 30_000;

/** Minimum requests in the window before we judge a VP */
const MIN_REQUESTS_FOR_EVALUATION = 3;

/** VPs with success rate below this are considered unhealthy */
const SUCCESS_RATE_THRESHOLD = 0.5;

function isUnhealthy(snapshot: VpHealthSnapshot): boolean {
  if (snapshot.totalRequests < MIN_REQUESTS_FOR_EVALUATION) {
    return false;
  }
  return snapshot.successRate < SUCCESS_RATE_THRESHOLD;
}

export function useUnhealthyVps(): Set<string> {
  const { data: snapshots } = useQuery<VpHealthSnapshot[]>({
    queryKey: ["vpHealth"],
    queryFn: fetchVpHealth,
    refetchInterval: POLL_INTERVAL_MS,
    // fetchVpHealth returns [] on any failure (graceful degradation),
    // so all VPs remain visible when the endpoint is down
    retry: false,
    refetchOnWindowFocus: false,
  });

  return useMemo(() => {
    if (!snapshots) return new Set<string>();

    const unhealthy = new Set<string>();
    for (const snapshot of snapshots) {
      if (isUnhealthy(snapshot)) {
        unhealthy.add(snapshot.address.toLowerCase());
      }
    }
    return unhealthy;
  }, [snapshots]);
}
