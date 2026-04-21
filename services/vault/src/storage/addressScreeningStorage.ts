/**
 * Local Storage utilities for address screening results
 *
 * Caches per-address screening outcomes so we don't re-hit the utils-api
 * on every wallet reconnection. Keyed by lowercased address within a
 * network-scoped map.
 */

const BTC_NETWORK = process.env.NEXT_PUBLIC_BTC_NETWORK ?? "unknown";
const STORAGE_KEY = `tbv-address-screening-${BTC_NETWORK}`;

/** Re-screen addresses after 24 hours so updated risk assessments propagate. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  blocked: boolean;
  ts: number;
}

type ScreeningMap = Record<string, CacheEntry>;

function readMap(): ScreeningMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ScreeningMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeMap(map: ScreeningMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

export function getAddressScreeningResult(
  address: string,
): boolean | undefined {
  if (!address) return undefined;
  const map = readMap();
  const entry = map[normalize(address)];
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return undefined;
  return entry.blocked;
}

export function setAddressScreeningResult(
  address: string,
  failedRiskAssessment: boolean,
): void {
  if (!address) return;
  const map = readMap();
  map[normalize(address)] = { blocked: failedRiskAssessment, ts: Date.now() };
  writeMap(map);
}

export function removeAddressScreeningResult(address: string): void {
  if (!address) return;
  const map = readMap();
  delete map[normalize(address)];
  writeMap(map);
}
