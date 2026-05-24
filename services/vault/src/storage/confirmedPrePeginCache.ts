/**
 * Persistent cache of Pre-PegIn txids the mempool has reported at
 * protocol-required depth. Once observed at depth the answer is permanent
 * (chain doesn't rewind), so we skip those txids in future polls — both
 * within a session and across page refreshes. TTL bounds cache size so
 * stale entries from long-resolved deposits don't accumulate forever.
 */

import { getBTCNetwork } from "@/config";

const STORAGE_KEY = `tbv-confirmed-prepegin-${getBTCNetwork()}`;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  // `> cutoff` naturally drops NaN/strings/undefined — no separate typeof check needed.
  for (const [txid, ts] of Object.entries(map)) {
    if (ts > cutoff) out[txid] = ts;
  }
  return out;
}

export function loadConfirmedPrePeginTxids(): Set<string> {
  const map = readMap();
  const pruned = pruneExpired(map, Date.now());
  if (Object.keys(pruned).length !== Object.keys(map).length) {
    writeMap(pruned);
  }
  return new Set(Object.keys(pruned));
}

export function addConfirmedPrePeginTxid(canonicalTxid: string): void {
  if (!canonicalTxid) return;
  const now = Date.now();
  const map = pruneExpired(readMap(), now);
  if (map[canonicalTxid] !== undefined) return;
  map[canonicalTxid] = now;
  writeMap(map);
}
