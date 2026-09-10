/**
 * Local record of which vaults have their recovery artifacts saved to disk.
 *
 * This is a *receipt*, not a flag. Storing a bare "true" could not distinguish
 * a bundle downloaded for this pegin from a stale one, from a different
 * vault's, or from a fetch that resolved without a file ever reaching disk —
 * so it asserted more than it knew. A receipt records what was saved, and
 * {@link hasArtifactsDownloaded} only reports true when the record matches the
 * pegin being asked about.
 *
 * Receipts written by earlier builds were bare `"true"` strings. Those are
 * deliberately not honored: the whole point is that the old signal was not
 * evidence. Affected users see the artifact warning again and can re-download.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { logger } from "@/infrastructure";
import type { ArtifactSaveMethod } from "@/services/artifacts";

const ARTIFACTS_DOWNLOADED_KEY_PREFIX = "tbv:artifacts-downloaded:";

/**
 * Bumped whenever the receipt shape changes. A receipt from a different
 * version is discarded rather than migrated — re-downloading is safe, and
 * guessing at an old record's meaning is not.
 */
export const ARTIFACT_RECEIPT_VERSION = 1;

/** Length of a hex-encoded SHA-256 digest. */
const SHA256_HEX_LENGTH = 64;

const SHA256_HEX_PATTERN = /^[0-9a-f]+$/;

export interface ArtifactDownloadReceipt {
  version: number;
  /** Pegin txid the bundle was fetched for, without 0x prefix, lowercased. */
  peginTxid: string;
  filename: string;
  byteLength: number;
  /** SHA-256 of the saved file, lowercase hex. */
  sha256: string;
  savedAt: number;
  method: ArtifactSaveMethod;
}

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function storageKey(vaultId: string): string {
  return `${ARTIFACTS_DOWNLOADED_KEY_PREFIX}${vaultId.toLowerCase()}`;
}

export function normalizePeginTxid(peginTxid: string): string {
  return stripHexPrefix(peginTxid).toLowerCase();
}

function isValidReceipt(value: unknown): value is ArtifactDownloadReceipt {
  // `JSON.parse("true")` returns the boolean true rather than throwing, so a
  // legacy flag reaches here as a non-object. This check is what invalidates
  // it; without it every stale flag would survive.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const receipt = value as Record<string, unknown>;
  return (
    receipt.version === ARTIFACT_RECEIPT_VERSION &&
    typeof receipt.peginTxid === "string" &&
    receipt.peginTxid.length > 0 &&
    typeof receipt.filename === "string" &&
    typeof receipt.byteLength === "number" &&
    Number.isFinite(receipt.byteLength) &&
    receipt.byteLength > 0 &&
    typeof receipt.sha256 === "string" &&
    receipt.sha256.length === SHA256_HEX_LENGTH &&
    SHA256_HEX_PATTERN.test(receipt.sha256) &&
    typeof receipt.savedAt === "number" &&
    Number.isFinite(receipt.savedAt) &&
    (receipt.method === "file-system-access" ||
      receipt.method === "browser-download")
  );
}

/**
 * Read the stored receipt for a vault, discarding anything unreadable,
 * outdated, or malformed so a bad record cannot linger.
 */
function readArtifactDownloadReceipt(
  vaultId: string,
): ArtifactDownloadReceipt | null {
  if (!isBrowserStorageAvailable() || !vaultId) return null;

  const key = storageKey(vaultId);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage unavailable (private browsing, blocked cookies). Reporting "no
    // receipt" keeps the user on the warn-and-acknowledge path, which is the
    // safe direction to fail.
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!isValidReceipt(parsed)) {
    // Self-heal: a legacy flag or corrupt record is removed so it is not
    // re-examined on every render.
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing more to do — the read already reports "no receipt".
    }
    return null;
  }

  return parsed;
}

/**
 * True only when this vault has a receipt for *this* pegin. A receipt for a
 * different pegin, or none at all, reads as not-downloaded.
 */
export function hasArtifactsDownloaded(
  vaultId: string,
  peginTxid: string,
): boolean {
  if (!peginTxid) return false;
  const receipt = readArtifactDownloadReceipt(vaultId);
  return receipt?.peginTxid === normalizePeginTxid(peginTxid);
}

/**
 * Drop every stored receipt, returning how many were removed.
 *
 * Dev-only affordance: once a vault's gate is satisfied the card hides its
 * download button, so there is otherwise no way to re-run the flow against
 * the same vault. Exposed through the god-mode panel.
 */
export function clearArtifactDownloadReceipts(): number {
  if (!isBrowserStorageAvailable()) return 0;
  try {
    const keys = Object.keys(window.localStorage).filter((key) =>
      key.startsWith(ARTIFACTS_DOWNLOADED_KEY_PREFIX),
    );
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
    return keys.length;
  } catch {
    return 0;
  }
}

export function saveArtifactDownloadReceipt(
  vaultId: string,
  receipt: ArtifactDownloadReceipt,
): void {
  if (!isBrowserStorageAvailable() || !vaultId) return;
  try {
    window.localStorage.setItem(storageKey(vaultId), JSON.stringify(receipt));
  } catch (err) {
    // Quota exceeded or private browsing. The gate will simply continue to
    // warn the user, which is the safe default, but it is worth knowing about.
    logger.warn("Failed to persist the artifact download receipt", {
      category: "activation",
      reason: String(err),
    });
  }
}
