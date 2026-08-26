/**
 * Persistent cache of vault ids whose Pre-PegIn HTLC output has been observed
 * spent-and-confirmed on Bitcoin (i.e. the depositor's refund landed). A
 * confirmed spend is terminal, so once cached the dashboard stops polling the
 * `outspend` endpoint for that vault and keeps rendering "Refunded".
 *
 * Keyed by vault id (not Pre-PegIn txid): batched siblings share one Pre-PegIn
 * tx but each owns a distinct HTLC output, so one sibling can be refunded while
 * another is not. Sibling of `matureRefundCache` (CSV maturity, keyed by txid).
 */

import { getBTCNetwork } from "@/config";

const STORAGE_KEY = `tbv-refunded-htlc-${getBTCNetwork()}`;
// TTL only matters on fresh page loads (in-session the `Set` lives in memory).
// 1h bounds blast radius for any buggy entry; a reorg that un-spends a
// confirmed refund re-surfaces within a poll cycle after expiry.
const CACHE_TTL_MS = 60 * 60 * 1000;

function readMap(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

function pruneExpired(
  map: Record<string, number>,
  now: number,
): Record<string, number> {
  const cutoff = now - CACHE_TTL_MS;
  const out: Record<string, number> = {};
  for (const [vaultId, ts] of Object.entries(map)) {
    if (ts > cutoff) out[vaultId] = ts;
  }
  return out;
}

export function loadRefundedHtlcVaultIds(): Set<string> {
  const map = readMap();
  const pruned = pruneExpired(map, Date.now());
  if (Object.keys(pruned).length !== Object.keys(map).length) {
    writeMap(pruned);
  }
  return new Set(Object.keys(pruned));
}

export function addRefundedHtlcVaultId(vaultId: string): void {
  if (!vaultId) return;
  const key = vaultId.toLowerCase();
  const now = Date.now();
  const map = pruneExpired(readMap(), now);
  if (map[key] !== undefined) return;
  map[key] = now;
  writeMap(map);
}
