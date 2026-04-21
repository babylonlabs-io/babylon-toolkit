import { isAddress } from "viem";

import { ENV } from "@/config/env";
import { logger } from "@/infrastructure";
import type { VpHealthSnapshot } from "@/types/vpHealth";

/** Timeout for the VP health fetch, well under the 30s poll interval. */
const VP_HEALTH_TIMEOUT_MS = 15_000;

/**
 * Fetches vault-provider health snapshots from the VP proxy.
 *
 * The proxy returns metrics for every VP that received traffic within its
 * sliding window. VPs absent from the response had no recent traffic and
 * are considered healthy by default.
 *
 * Returns an empty array on any failure (5xx, network error, timeout, etc.)
 * so the caller never needs error handling — an empty result means
 * "assume all VPs are healthy" (graceful degradation).
 */
export async function fetchVpHealth(): Promise<VpHealthSnapshot[]> {
  const url = `${ENV.VP_PROXY_URL}/vp-health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VP_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      clearTimeout(timeoutId);
      logger.warn("VP health endpoint returned non-OK status", {
        data: { status: response.status },
      });
      return [];
    }

    const data: unknown = await response.json();
    clearTimeout(timeoutId);
    if (!Array.isArray(data)) return [];

    return data.filter((item): item is VpHealthSnapshot => {
      if (typeof item !== "object" || item === null) return false;

      const record = item as Record<string, unknown>;

      if (typeof record.address !== "string") return false;
      if (typeof record.successRate !== "number") return false;
      if (typeof record.totalRequests !== "number") return false;

      if (!isAddress(record.address, { strict: false })) return false;
      if (record.successRate < 0 || record.successRate > 1) return false;
      if (record.totalRequests < 0) return false;

      return true;
    });
  } catch (error) {
    clearTimeout(timeoutId);
    logger.warn("VP health endpoint unreachable", { data: { error } });
    return [];
  }
}
