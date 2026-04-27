/**
 * Local Storage utilities for pending peg-in transactions
 *
 * Purpose:
 * - Store pending deposits temporarily until they reach Active state (contract status 2+)
 * - Track user actions through localStorage status field
 * - Show immediate feedback to users after deposit submission
 * - Auto-cleanup based on peginStateMachine shouldRemoveFromLocalStorage logic
 *
 * Cleanup Strategy:
 * - Keep entries for contract status 0-1 (PENDING, VERIFIED)
 * - Remove entries for contract status 2+ (ACTIVE, REDEEMED)
 * - Remove when contract status has progressed beyond local status
 * - Status field tracks user actions: pending → payout_signed → confirming
 */

import type { Hex } from "viem";

import { logger } from "@/infrastructure";

import { STORAGE_KEY_PREFIX, STORAGE_UPDATE_EVENT } from "../constants";
import {
  LocalStorageStatus,
  shouldRemoveFromLocalStorage,
  type ContractStatus,
} from "../models/peginStateMachine";

export interface PendingPeginRequest {
  id: Hex; // Derived vault ID: keccak256(abi.encode(peginTxHash, depositor))
  timestamp: number; // When the peg-in was initiated
  amount?: string; // Amount in BTC (formatted for display)
  providerIds?: string[]; // Vault provider's Ethereum addresses
  applicationEntryPoint?: string; // Application controller address (for identifying the app)
  status: LocalStorageStatus; // Track user actions (required, defaults to PENDING)
  peginTxHash: Hex; // Raw BTC pegin transaction hash
  depositorBtcPubkey?: string; // Depositor's BTC public key (x-only, for WOTS derivation in resume flow)
  // Anchor for the REFUND_BROADCAST optimistic suppression TTL: a broadcast tx
  // can be evicted from the mempool and never confirm, so the suppression must
  // expire to let the user retry instead of permanently hiding the action.
  refundBroadcastAt?: number;
  // Fields for cross-device broadcasting support
  unsignedTxHex: string; // Funded Pre-PegIn tx hex (for broadcasting later)
  selectedUTXOs?: Array<{
    // UTXOs used in the transaction
    txid: string;
    vout: number;
    value: string; // Store as string for JSON serialization
    scriptPubKey: string;
  }>;
  // Multi-vault tracking fields
  batchId?: string; // UUID linking vaults created together
  batchIndex?: number; // Position in batch (1-based: 1 or 2)
  batchTotal?: number; // Total vaults in batch (1 or 2)
}

// Hex with optional 0x prefix and at least one byte (even-length).
// Matches `0x<even-hex>` or `<even-hex>`; rejects bare `0x` and odd lengths.
const NON_EMPTY_HEX_RE = /^(0x)?([0-9a-fA-F]{2})+$/;
// Bitcoin txids are always 32 bytes = exactly 64 hex chars.
const TXID_HEX_RE = /^[0-9a-fA-F]{64}$/;
// scriptPubKey is variable-length but must be an even number of hex chars.
// Intentionally distinct from NON_EMPTY_HEX_RE: raw Bitcoin script is never
// 0x-prefixed, so the prefix option is disallowed here. Do not "dedupe" these.
const SCRIPT_PUBKEY_HEX_RE = /^([0-9a-fA-F]{2})+$/;
// Valid LocalStorageStatus string values. Kept in lock-step with
// OffChainTrackingStatus in models/peginStateMachine.ts.
const VALID_LOCAL_STORAGE_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "payout_signed",
  "confirming",
  "confirmed",
  "refund_broadcast",
]);
// Vault `id` is keccak256(abi.encode(peginTxHash, depositor)) — always 32 bytes.
// `peginTxHash` is a Bitcoin tx hash — also 32 bytes. Accept the legacy form
// without `0x` prefix (normalizeTransactionId canonicalizes downstream).
const BYTES32_HEX_RE = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Validate the security-critical fields of a pending peg-in read from
 * localStorage.
 *
 * localStorage is an untrusted boundary: entries can be tampered by XSS,
 * browser extensions, or a user manually editing devtools. Every field used in
 * a security-relevant code path (UTXO reservation, on-chain vault matching,
 * PSBT construction, or ID normalization) must pass a strict shape check. A
 * non-string `id`, for example, would otherwise throw inside
 * `normalizeTransactionId`, fall into the outer catch block, and wipe the
 * whole storage key — a DoS from a single tampered entry.
 */
function hasValidSecurityFields(entry: unknown): entry is PendingPeginRequest {
  if (!entry || typeof entry !== "object") return false;
  const pegin = entry as Record<string, unknown>;

  if (typeof pegin.id !== "string" || !BYTES32_HEX_RE.test(pegin.id)) {
    return false;
  }
  if (
    typeof pegin.peginTxHash !== "string" ||
    !BYTES32_HEX_RE.test(pegin.peginTxHash)
  ) {
    return false;
  }
  if (
    typeof pegin.timestamp !== "number" ||
    !Number.isFinite(pegin.timestamp) ||
    pegin.timestamp < 0
  ) {
    return false;
  }

  // `status` may be missing (legacy entries — line 200 back-fills to PENDING),
  // but if present it must be one of the known enum string values. A tampered
  // status (e.g. a number, or a non-enum string) could otherwise slip past
  // the `pegin.status || ...` fallback and confuse the state machine.
  if (pegin.status !== undefined) {
    if (
      typeof pegin.status !== "string" ||
      !VALID_LOCAL_STORAGE_STATUSES.has(pegin.status)
    ) {
      return false;
    }
  }

  if (pegin.refundBroadcastAt !== undefined) {
    if (
      typeof pegin.refundBroadcastAt !== "number" ||
      !Number.isFinite(pegin.refundBroadcastAt) ||
      pegin.refundBroadcastAt < 0
    ) {
      return false;
    }
  }

  if (typeof pegin.unsignedTxHex !== "string") return false;
  // Empty string is the explicit cross-device "no local data" marker; anything
  // else must be non-empty, even-length hex bytes (`0x` prefix optional).
  if (
    pegin.unsignedTxHex !== "" &&
    !NON_EMPTY_HEX_RE.test(pegin.unsignedTxHex)
  ) {
    return false;
  }

  if (pegin.selectedUTXOs !== undefined) {
    if (!Array.isArray(pegin.selectedUTXOs)) return false;
    for (const candidate of pegin.selectedUTXOs) {
      if (!candidate || typeof candidate !== "object") return false;
      const utxo = candidate as Record<string, unknown>;
      if (typeof utxo.txid !== "string" || !TXID_HEX_RE.test(utxo.txid)) {
        return false;
      }
      if (
        typeof utxo.vout !== "number" ||
        !Number.isInteger(utxo.vout) ||
        utxo.vout < 0
      ) {
        return false;
      }
      if (typeof utxo.value !== "string") return false;
      const numValue = Number(utxo.value);
      // Bitcoin outputs must carry value — a zero-sat UTXO is not a valid
      // spendable output (dust rules aside, the protocol requires value > 0).
      if (!Number.isSafeInteger(numValue) || numValue <= 0) return false;
      if (
        typeof utxo.scriptPubKey !== "string" ||
        !SCRIPT_PUBKEY_HEX_RE.test(utxo.scriptPubKey)
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get storage key for a specific address
 */
function getStorageKey(ethAddress: string): string {
  return `${STORAGE_KEY_PREFIX}-${ethAddress}`;
}

/**
 * Normalize transaction ID to ensure it has 0x prefix
 * This handles legacy data that might not have the prefix
 */
function normalizeTransactionId(id: string): Hex {
  return (id.startsWith("0x") ? id : `0x${id}`) as Hex;
}

/**
 * Dispatch custom event to notify React hooks of localStorage changes
 */
function dispatchStorageUpdateEvent(ethAddress: string): void {
  window.dispatchEvent(
    new CustomEvent(STORAGE_UPDATE_EVENT, {
      detail: { ethAddress },
    }),
  );
}

/**
 * Get all pending peg-ins from localStorage for an address
 * Pure read function - no side effects
 */
export function getPendingPegins(ethAddress: string): PendingPeginRequest[] {
  if (!ethAddress) return [];

  try {
    const key = getStorageKey(ethAddress);
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    // Filter out entries whose security-critical fields (unsignedTxHex,
    // selectedUTXOs) fail a strict format check. A tampered entry would
    // otherwise feed malformed hex into downstream consumers.
    const validated = parsed.filter((entry): entry is PendingPeginRequest => {
      if (hasValidSecurityFields(entry)) return true;
      const maybeId =
        entry && typeof entry === "object" && "id" in entry
          ? String((entry as { id: unknown }).id)
          : "unknown";
      logger.warn("[peginStorage] Skipping corrupted pending pegin entry", {
        category: "peginStorage",
        vaultId: maybeId,
      });
      return false;
    });

    // Normalize IDs to ensure they all have 0x prefix (handles legacy data)
    // Note: We do NOT save back to localStorage here to avoid side effects
    const normalized = validated.map((pegin) => ({
      ...pegin,
      id: normalizeTransactionId(pegin.id),
      // Ensure status field exists (backward compatibility)
      status: pegin.status || LocalStorageStatus.PENDING,
    }));

    return normalized;
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), {
      data: {
        context:
          "[peginStorage] Failed to parse pending pegins - Clearing corrupted data",
      },
    });
    try {
      localStorage.removeItem(getStorageKey(ethAddress));
    } catch (clearError) {
      logger.error(
        clearError instanceof Error
          ? clearError
          : new Error(String(clearError)),
        { data: { context: "[peginStorage] Failed to clear corrupted data" } },
      );
    }
    return [];
  }
}

/**
 * Save pending peg-ins to localStorage
 * If pegins array is empty, delete the entire key instead of storing empty array
 * Dispatches a custom event to notify React hooks of the change
 */
export function savePendingPegins(
  ethAddress: string,
  pegins: PendingPeginRequest[],
): void {
  if (!ethAddress) return;

  try {
    const key = getStorageKey(ethAddress);

    // If no pegins left, delete the entire key
    if (pegins.length === 0) {
      localStorage.removeItem(key);
    } else {
      // Ensure all IDs are normalized before saving
      const normalizedPegins = pegins.map((pegin) => ({
        ...pegin,
        id: normalizeTransactionId(pegin.id),
      }));
      localStorage.setItem(key, JSON.stringify(normalizedPegins));
    }

    // Dispatch custom event to notify React hooks
    dispatchStorageUpdateEvent(ethAddress);
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), {
      data: { context: "[peginStorage] Failed to save pending pegins" },
    });
  }
}

/**
 * Add a new pending peg-in to localStorage
 * Prevents duplicates: if txid already exists, removes old entry before adding new one
 * Status defaults to LocalStorageStatus.PENDING if not provided
 */
export function addPendingPegin(
  ethAddress: string,
  pegin: Omit<PendingPeginRequest, "timestamp" | "status"> & {
    status?: LocalStorageStatus;
  },
): void {
  const existingPegins = getPendingPegins(ethAddress);

  // Normalize the ID to ensure it has 0x prefix
  const normalizedId = normalizeTransactionId(pegin.id);

  // Remove existing pegin with same txid to prevent duplicates
  const filteredPegins = existingPegins.filter((p) => p.id !== normalizedId);

  const newPegin: PendingPeginRequest = {
    ...pegin,
    id: normalizedId, // Use normalized ID
    status: pegin.status || LocalStorageStatus.PENDING, // Default to PENDING
    timestamp: Date.now(),
  };

  // Add new pegin
  const updatedPegins = [...filteredPegins, newPegin];

  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Update status of a pending peg-in
 * Used to track user actions through the peg-in flow
 */
export function updatePendingPeginStatus(
  ethAddress: string,
  vaultId: string,
  status: LocalStorageStatus,
): void {
  const existingPegins = getPendingPegins(ethAddress);
  const normalizedId = normalizeTransactionId(vaultId);

  const updatedPegins = existingPegins.map((pegin) =>
    pegin.id === normalizedId ? { ...pegin, status } : pegin,
  );

  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Mark a pending peg-in as having broadcast its refund tx, anchoring the
 * timestamp used by the optimistic-suppression TTL.
 */
export function markRefundBroadcast(
  ethAddress: string,
  vaultId: string,
  refundBroadcastAt: number,
): void {
  const existingPegins = getPendingPegins(ethAddress);
  const normalizedId = normalizeTransactionId(vaultId);

  const updatedPegins = existingPegins.map((pegin) =>
    pegin.id === normalizedId
      ? {
          ...pegin,
          status: LocalStorageStatus.REFUND_BROADCAST,
          refundBroadcastAt,
        }
      : pegin,
  );

  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Filter and clean up old pending peg-ins
 *
 * Uses peginStateMachine.shouldRemoveFromLocalStorage() for cleanup logic:
 * - Keep entries for contract status 0-1 (PENDING, VERIFIED)
 * - Remove entries for contract status 2+ (ACTIVE, REDEEMED)
 * - Remove when contract status has progressed beyond local status
 *
 * This ensures localStorage stays in sync with the state machine
 */
export function filterPendingPegins(
  pendingPegins: PendingPeginRequest[],
  confirmedPegins: Array<{ id: string; status: number }>,
): PendingPeginRequest[] {
  // Normalize confirmed pegin IDs to ensure they have 0x prefix
  const normalizedConfirmedPegins = confirmedPegins.map((p) => ({
    id: normalizeTransactionId(p.id),
    status: p.status as ContractStatus,
  }));

  return pendingPegins.filter((pegin) => {
    // Normalize the pending pegin ID as well (should already be normalized, but just in case)
    const normalizedPeginId = normalizeTransactionId(pegin.id);

    // Check if pegin exists on blockchain (using normalized IDs)
    const confirmedPegin = normalizedConfirmedPegins.find(
      (p) => p.id === normalizedPeginId,
    );

    // If it doesn't exist on blockchain yet, keep it in localStorage
    if (!confirmedPegin) {
      return true;
    }

    // If it exists on blockchain, use peginStateMachine to determine if we should remove it
    // This handles the logic for keeping status 0-1 and removing status 2+
    return !shouldRemoveFromLocalStorage(
      confirmedPegin.status,
      pegin.status,
      pegin.refundBroadcastAt,
    );
  });
}
