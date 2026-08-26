/**
 * Persistent cache of Pre-PegIn txids past `tRefund` (HTLC CSV elapsed).
 * Sibling of `confirmedPrePeginCache` (which tracks min-depth) — two
 * caches because thresholds differ and past min-depth ≠ past `tRefund`.
 */

import { getBTCNetwork } from "@/config";

const STORAGE_KEY = `tbv-mature-refund-${getBTCNetwork()}`;
// TTL only matters on fresh page loads (in-session the `Set` lives in
// memory). 1h bounds blast radius for any buggy entry that lands here.
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
  for (const [txid, ts] of Object.entries(map)) {
    if (ts > cutoff) out[txid] = ts;
  }
  return out;
}

export function loadMatureRefundTxids(): Set<string> {
  const map = readMap();
  const pruned = pruneExpired(map, Date.now());
  if (Object.keys(pruned).length !== Object.keys(map).length) {
    writeMap(pruned);
  }
  return new Set(Object.keys(pruned));
}

export function addMatureRefundTxid(canonicalTxid: string): void {
  if (!canonicalTxid) return;
  const now = Date.now();
  const map = pruneExpired(readMap(), now);
  if (map[canonicalTxid] !== undefined) return;
  map[canonicalTxid] = now;
  writeMap(map);
}
