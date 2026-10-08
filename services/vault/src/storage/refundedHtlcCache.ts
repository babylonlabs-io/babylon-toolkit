/** Confirmed refund hashes, keyed by vault ID to keep batched outputs separate. */
import { getBTCNetwork } from "@/config";

const STORAGE_KEY = `tbv-refunded-htlc-${getBTCNetwork()}`;
// Entries expire on reload. Confirmed refunds do not need an in-session poll.
const CACHE_TTL_MS = 60 * 60 * 1000;
type Entry = { confirmedAt: number; refundTxId?: string };

function readMap(): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return entries;
    for (const [vaultId, value] of Object.entries(parsed)) {
      // Older entries contain only the confirmation time.
      const entry = typeof value === "number" ? { confirmedAt: value } : value;
      if (
        !entry ||
        typeof entry !== "object" ||
        !("confirmedAt" in entry) ||
        typeof entry.confirmedAt !== "number" ||
        entry.confirmedAt <= Date.now() - CACHE_TTL_MS ||
        entry.confirmedAt > Date.now()
      )
        continue;
      entries[vaultId.toLowerCase()] = {
        confirmedAt: entry.confirmedAt,
        refundTxId:
          "refundTxId" in entry &&
          typeof entry.refundTxId === "string" &&
          /^[0-9a-f]{64}$/i.test(entry.refundTxId)
            ? entry.refundTxId
            : undefined,
      };
    }
  } catch {
    /* Disabled storage or invalid JSON. */
  }
  return entries;
}

function writeMap(map: Record<string, Entry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

export function loadRefundedHtlcs(): Map<string, string | undefined> {
  const map = readMap();
  writeMap(map);
  return new Map(
    Object.entries(map).map(([id, entry]) => [id, entry.refundTxId]),
  );
}

export function addRefundedHtlc(vaultId: string, refundTxId?: string): void {
  if (!vaultId) return;
  const key = vaultId.toLowerCase();
  const map = readMap();
  map[key] = {
    confirmedAt: map[key]?.confirmedAt ?? Date.now(),
    refundTxId:
      refundTxId && /^[0-9a-f]{64}$/i.test(refundTxId)
        ? refundTxId
        : map[key]?.refundTxId,
  };
  writeMap(map);
}
