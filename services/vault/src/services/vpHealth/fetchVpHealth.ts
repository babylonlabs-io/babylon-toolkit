import { ENV } from "@/config/env";
import { logger } from "@/infrastructure";
import type { VpHealthSnapshot } from "@/types/vpHealth";

/**
 * Fetches vault-provider health snapshots from the VP proxy.
 *
 * The proxy returns metrics for every VP that received traffic within its
 * sliding window. VPs absent from the response had no recent traffic and
 * are considered healthy by default.
 *
 * Returns an empty array on any failure (5xx, network error, etc.)
 * so the caller never needs error handling — an empty result means
 * "assume all VPs are healthy" (graceful degradation).
 */
export async function fetchVpHealth(): Promise<VpHealthSnapshot[]> {
  const url = `${ENV.VP_PROXY_URL}/vp-health`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      logger.warn("VP health endpoint returned non-OK status", {
        data: { status: response.status },
      });
      return [];
    }

    return (await response.json()) as VpHealthSnapshot[];
  } catch (error) {
    logger.warn("VP health endpoint unreachable", { data: { error } });
    return [];
  }
}
