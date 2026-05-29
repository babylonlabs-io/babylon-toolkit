/**
 * Deposit-flow error mapping.
 *
 * Converts the raw `unknown` errors thrown across the deposit lifecycle into a
 * user-facing { title, body } shown in the error Callout (see
 * `DepositProgressView`). Mapping happens at the catch site — where the typed
 * error (JsonRpcError code, wallet rejection code, ContractError, version
 * mismatch) is still intact — so the classification can be precise. By the time
 * an error reaches the view it is already a friendly { title, body }.
 *
 * Enumerated error sources (the map's spec):
 *  - Wallet rejection — user declines a signing prompt (CONNECTION_REJECTED, or
 *    "user rejected" / "denied" in the message).
 *  - Vault-provider RPC — JsonRpcError from the VP (syncing, timeout, network,
 *    proxy timeout/unavailable, generic). Delegated to `mapVpRpcError`.
 *  - Registered-version mismatch — protocol params rotated mid-deposit.
 *  - Wallet not connected / wallet client missing.
 *  - Wallet account changed mid-flow (the WOTS-vs-PoP key guard).
 *  - Wrong wallet connected on resume (WOTS hash mismatch).
 *  - Broadcast failure — Pre-PegIn could not be broadcast to Bitcoin.
 *  - Insufficient ETH — the Ethereum registration tx can't cover gas. Detected
 *    via the shared `classifyError` (viem typed error + node-message regex),
 *    not by hand-matching gas wording.
 *  - Vault provider not found.
 *  - Bitcoin funds unavailable — UTXO load / availability (phrase-level match).
 *  - Everything else — fall back to the sanitized raw message under the generic
 *    "Transaction failed" title (preserves prior behavior, no info hidden).
 */

import { isRegisteredVaultVersionMismatchError } from "@babylonlabs-io/ts-sdk/tbv/core";
import { JsonRpcError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type ReactNode } from "react";

import { COPY } from "@/copy";

import {
  classifyError,
  isWalletRejectionError,
  mapVpRpcError,
  sanitizeErrorMessage,
} from "./formatting";

export interface DepositErrorContent {
  title: string;
  /**
   * ReactNode (not just string) so a future error can embed a link, code span,
   * or emphasized phrase. Today every mapped body is a plain copy string.
   */
  body: ReactNode;
}

const ERRORS = COPY.deposit.errors;

/**
 * Extract a lowercase message from an unknown error for substring matching.
 * Includes viem's `shortMessage` (often where "insufficient funds" lives)
 * alongside the standard `message`.
 */
function lowerMessage(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
  } else if (typeof err === "string") {
    parts.push(err);
  }
  if (err !== null && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.shortMessage === "string") parts.push(obj.shortMessage);
    if (typeof obj.message === "string") parts.push(obj.message);
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Map a deposit-flow error to a user-facing { title, body }.
 * Pure: no side effects, safe to unit-test directly.
 */
export function mapDepositError(err: unknown): DepositErrorContent {
  // 1. Wallet rejection (coded) — most specific signal.
  if (isWalletRejectionError(err)) {
    return ERRORS.signingRejected;
  }

  // 2. Vault-provider JSON-RPC errors — reuse the shared VP mapping.
  if (err instanceof JsonRpcError) {
    const { title, message } = mapVpRpcError(err);
    return { title, body: message };
  }

  // 3. Protocol-parameter version mismatch (registered vault drifted).
  if (isRegisteredVaultVersionMismatchError(err)) {
    return ERRORS.versionMismatch;
  }

  const msg = lowerMessage(err);

  // 4. Wallet account changed mid-flow (WOTS-vs-PoP key guard).
  if (msg.includes("wallet account changed")) {
    return ERRORS.walletAccountChanged;
  }

  // 4b. Wrong BTC wallet connected on resume: the submitted WOTS key hash
  // doesn't match the on-chain commitment. Specific and recoverable (switch
  // accounts), so it gets its own title instead of the generic fallback.
  if (
    msg.includes("wrong wallet is connected") ||
    msg.includes("wots public key hash does not match")
  ) {
    return ERRORS.wrongWalletAccount;
  }

  // 5. Wallet not connected / wallet client unavailable. Checked before the
  // broadcast bucket: the broadcast step wraps inner errors as "Failed to
  // broadcast ...: <inner>", and a disconnect there should still read as a
  // wallet problem, not a generic broadcast failure.
  if (
    msg.includes("wallet not connected") ||
    msg.includes("wallet is not connected") ||
    msg.includes("failed to get wallet client")
  ) {
    return ERRORS.walletNotConnected;
  }

  // 6. Wallet signing rejection. The coded path (step 1) misses rejections that
  // happen inside the broadcast step, because that catch re-wraps them in a
  // fresh Error (losing the code). Match the phrasing before the broadcast
  // bucket so "Failed to broadcast ...: user rejected" reads as a rejection.
  // Scope to wallet phrases ("user rejected/denied/cancelled") so unrelated
  // "access denied"/"permission denied" errors don't get mislabeled.
  if (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("user cancelled") ||
    msg.includes("user canceled")
  ) {
    return ERRORS.signingRejected;
  }

  // 7. Pre-PegIn broadcast failure. Checked before the ETH-gas/UTXO buckets:
  // the flow wraps broadcast errors as "Failed to broadcast batch Pre-PegIn
  // transaction: <inner>", and that inner text can contain BTC-side
  // "insufficient funds" — a broadcast wrapper must win over the ETH-gas
  // classification.
  if (msg.includes("broadcast")) {
    return ERRORS.broadcastFailed;
  }

  // 8. Vault provider not found.
  if (msg.includes("vault provider not found")) {
    return ERRORS.providerNotFound;
  }

  // 9. Bitcoin funds unavailable — UTXO load / availability. Phrase-level
  // matches (not a bare "utxo") so unrelated UTXO-mentioning errors (e.g. a
  // stale snapshot or indexer outage) don't get absorbed here. Covers the
  // known throws: "No spendable UTXOs available", "Spendable UTXOs unavailable
  // ...", "Failed to load UTXOs". Checked BEFORE the ETH-gas bucket because
  // `classifyError` reads "Insufficient funds: no UTXOs available" as a gas
  // shortfall (no sats/pegin guard hit) — the UTXO phrase must win.
  if (
    msg.includes("spendable utxos") ||
    msg.includes("utxos available") ||
    msg.includes("failed to load utxos")
  ) {
    return ERRORS.utxosUnavailable;
  }

  // 10. Insufficient ETH to cover gas for the Ethereum registration tx. Defer
  // to the shared `classifyError`, which checks viem's typed `name`
  // ("InsufficientFundsError") plus its node-message regex and excludes the
  // BTC selector's "Insufficient funds: need N sats" — more robust across viem
  // upgrades than matching gas wording by hand.
  if (classifyError(err) === "insufficient-funds") {
    return ERRORS.insufficientEthForGas;
  }

  // 11. Fallback: keep the sanitized raw message under the generic title so no
  // diagnostic info is hidden. `sanitizeErrorMessage` returns the "Unknown
  // error" sentinel for opaque throws — swap that for the friendlier
  // genericBody so the callout never shows "Unknown error".
  const raw = sanitizeErrorMessage(err);
  return {
    title: ERRORS.defaultTitle,
    body: raw === "Unknown error" ? ERRORS.genericBody : raw,
  };
}
