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

import {
  stripHexPrefix,
  X_ONLY_PUBKEY_HEX_LEN,
} from "@babylonlabs-io/ts-sdk/tbv/core";

import { logger } from "@/infrastructure";
import type { ArtifactSaveMethod } from "@/services/artifacts";
// Leaf modules, not the barrel: the barrel loads the VP client and with it the env config.
import { SHA256_HEX_LENGTH } from "@/services/artifacts/claimFile";
import { MAX_SESSIONS } from "@/services/artifacts/httpArtifactDownload";

const ARTIFACTS_DOWNLOADED_KEY_PREFIX = "tbv:artifacts-downloaded:";

/**
 * Marks a vault whose provider served a graph other than the one signed at
 * presign. The value is the pegin txid the mismatch was found for.
 */
const GRAPH_MISMATCH_KEY_PREFIX = "tbv:artifacts-graph-mismatch:";

/**
 * The presign graph fingerprint of a vault, kept outside its pending entry:
 * written when cleanup removes that entry at VERIFIED or ACTIVE, when a presign
 * finds no readable entry to hold it, or when a legacy entry is dropped. A
 * later download still has to check the bundle against it.
 */
const SIGNED_GRAPH_FINGERPRINT_KEY_PREFIX = "tbv:signed-graph-fingerprint:";

/**
 * Version 2 adds the per-session hashes of the tar kit; version 1 receipts
 * (the hex-JSON kit) stay valid as evidence that a complete kit was saved.
 * Any other version is discarded rather than migrated.
 */
export const ARTIFACT_RECEIPT_VERSION = 2;

const LOWERCASE_HEX_PATTERN = /^[0-9a-f]+$/;

interface ArtifactDownloadReceiptBase {
  /** Pegin txid the kit was fetched for, without 0x prefix, lowercased. */
  peginTxid: string;
  filename: string;
  byteLength: number;
  /** SHA-256 of the saved file, lowercase hex. */
  sha256: string;
  savedAt: number;
  method: ArtifactSaveMethod;
}

/** The hex-JSON kit; still accepted as evidence that a kit was saved. */
export interface ArtifactDownloadReceiptV1 extends ArtifactDownloadReceiptBase {
  version: 1;
}

/** The tar kit, with the hash and length of every session entry. */
export interface ArtifactDownloadReceiptV2 extends ArtifactDownloadReceiptBase {
  version: 2;
  /** Keyed by challenger x-only key, lowercase hex. */
  sessions: Record<string, { sha256: string; byteLength: number }>;
}

export type ArtifactDownloadReceipt =
  | ArtifactDownloadReceiptV1
  | ArtifactDownloadReceiptV2;

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function storageKey(vaultId: string): string {
  return `${ARTIFACTS_DOWNLOADED_KEY_PREFIX}${vaultId.toLowerCase()}`;
}

function graphMismatchKey(vaultId: string): string {
  return `${GRAPH_MISMATCH_KEY_PREFIX}${vaultId.toLowerCase()}`;
}

function signedGraphFingerprintKey(vaultId: string): string {
  return `${SIGNED_GRAPH_FINGERPRINT_KEY_PREFIX}${vaultId.toLowerCase()}`;
}

function isLowercaseHex(value: unknown, length: number): value is string {
  return (
    typeof value === "string" &&
    value.length === length &&
    LOWERCASE_HEX_PATTERN.test(value)
  );
}

function isSha256Hex(value: string): boolean {
  return isLowercaseHex(value, SHA256_HEX_LENGTH);
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
  const baseValid =
    typeof receipt.peginTxid === "string" &&
    receipt.peginTxid.length > 0 &&
    typeof receipt.filename === "string" &&
    typeof receipt.byteLength === "number" &&
    Number.isFinite(receipt.byteLength) &&
    receipt.byteLength > 0 &&
    isLowercaseHex(receipt.sha256, SHA256_HEX_LENGTH) &&
    typeof receipt.savedAt === "number" &&
    Number.isFinite(receipt.savedAt) &&
    (receipt.method === "file-system-access" ||
      receipt.method === "browser-download");
  if (!baseValid) return false;
  switch (receipt.version) {
    case 1:
      return true;
    case 2:
      return isValidSessions(receipt.sessions);
    default:
      return false;
  }
}

/**
 * 1..MAX_SESSIONS entries keyed by challenger x-only key, each with a
 * SHA-256 and a positive integer length.
 */
function isValidSessions(value: unknown): boolean {
  // `typeof null === "object"`, as with the receipt itself.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_SESSIONS) return false;
  return entries.every(([key, session]) => {
    if (!isLowercaseHex(key, X_ONLY_PUBKEY_HEX_LEN)) return false;
    if (
      session === null ||
      typeof session !== "object" ||
      Array.isArray(session)
    ) {
      return false;
    }
    const { sha256, byteLength } = session as Record<string, unknown>;
    return (
      isLowercaseHex(sha256, SHA256_HEX_LENGTH) &&
      typeof byteLength === "number" &&
      Number.isSafeInteger(byteLength) &&
      byteLength > 0
    );
  });
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
 * Dev-only affordance: once a vault's gate is satisfied the activation dialog
 * offers no further download, so there is otherwise no way to re-run that
 * flow against the same vault. Exposed through the god-mode panel.
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
    // A receipt is written only for a bundle that matched the presign
    // fingerprint, so it supersedes an earlier mismatch.
    window.localStorage.removeItem(graphMismatchKey(vaultId));
  } catch (err) {
    // Quota exceeded or private browsing. The gate will simply continue to
    // warn the user, which is the safe default, but it is worth knowing about.
    logger.warn("Failed to persist the artifact download receipt", {
      category: "activation",
      reason: String(err),
    });
  }
}

/**
 * Record that a download for this pegin returned a graph other than the one
 * signed at presign. Unlike a missing receipt, this is evidence against
 * activating, so it must outlive the modal that found it. Only a later
 * receipt clears it.
 */
export function saveGraphMismatch(vaultId: string, peginTxid: string): void {
  if (!isBrowserStorageAvailable() || !vaultId) return;
  try {
    window.localStorage.setItem(
      graphMismatchKey(vaultId),
      normalizePeginTxid(peginTxid),
    );
  } catch (err) {
    // The in-session state still blocks activation; only a reopen loses it.
    logger.warn("Failed to persist the artifact graph mismatch", {
      category: "activation",
      reason: String(err),
    });
  }
}

/** True when a download for this pegin found a graph mismatch. */
export function hasGraphMismatch(vaultId: string, peginTxid: string): boolean {
  if (!isBrowserStorageAvailable() || !vaultId || !peginTxid) return false;
  try {
    return (
      window.localStorage.getItem(graphMismatchKey(vaultId)) ===
      normalizePeginTxid(peginTxid)
    );
  } catch {
    // Unreadable storage also rejected the write, so nothing was recorded.
    return false;
  }
}

/**
 * Keep a vault's presign graph fingerprint after its pending entry is removed.
 * Never throws.
 *
 * @returns false when nothing was written, so the caller keeps the pending
 * entry and the fingerprint with it.
 */
export function saveSignedGraphFingerprint(
  vaultId: string,
  fingerprint: string,
): boolean {
  if (!isBrowserStorageAvailable() || !vaultId) return false;
  try {
    window.localStorage.setItem(
      signedGraphFingerprintKey(vaultId),
      fingerprint,
    );
    return true;
  } catch (err) {
    logger.warn("Failed to persist the signed graph fingerprint", {
      category: "activation",
      reason: String(err),
    });
    return false;
  }
}

/**
 * The fingerprint kept for a vault whose pending entry was removed, or null
 * when there is none or the stored value is not a SHA-256 hex digest.
 */
export function readSignedGraphFingerprintRecord(
  vaultId: string,
): string | null {
  if (!isBrowserStorageAvailable() || !vaultId) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(signedGraphFingerprintKey(vaultId));
  } catch {
    return null;
  }
  return raw !== null && isSha256Hex(raw) ? raw : null;
}
