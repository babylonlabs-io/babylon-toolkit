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
 *  - Ethereum registration finality — the registration never reached the
 *    required confirmation depth, or disappeared from chain state entirely.
 *  - Wallet not connected / wallet client missing.
 *  - Wallet account changed mid-flow (the WOTS-vs-PoP key guard).
 *  - Wrong wallet connected on resume (WOTS hash mismatch).
 *  - Preparation failure — the Pre-PegIn could not be prepared for signing
 *    (e.g. prevout resolution against the mempool API failed).
 *  - Signing failure — the wallet could not sign the Pre-PegIn and it was not
 *    a rejection (locked wallet, stale extension, device transport drop).
 *  - Broadcast failure — Pre-PegIn could not be broadcast to Bitcoin.
 *  - Insufficient ETH — the Ethereum registration tx can't cover gas. Detected
 *    via the shared `classifyError` (viem typed error + node-message regex),
 *    not by hand-matching gas wording.
 *  - Vault provider not found.
 *  - Bitcoin funds unavailable — UTXO load / availability (phrase-level match).
 *  - Everything else — fall back to the sanitized raw message under the generic
 *    "Transaction failed" title (preserves prior behavior, no info hidden).
 */

import {
  isParticipantKeyDriftError,
  isPeginRegistrationMissingError,
  isPeginRegistrationNotFinalError,
  isRegisteredVaultVersionMismatchError,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { JsonRpcError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type ReactNode } from "react";

import { COPY } from "@/copy";

import {
  classifyError,
  formatErrorDiagnostics,
  mapVpRpcError,
  sanitizeErrorMessage,
} from "./formatting";
import { isUserCancellation, isWalletRejectionError } from "./userCancellation";
import { isVaultRecordEmptyError } from "./vaultRecordEmpty";

export interface DepositErrorContent {
  title: string;
  /**
   * ReactNode (not just string) so a future error can embed a link, code span,
   * or emphasized phrase. Today every mapped body is a plain copy string.
   */
  body: ReactNode;
  /**
   * Full raw error for the "copy details" action. `body` is deliberately
   * lossy, so this is what a reporter pastes instead of a screenshot.
   */
  diagnostics?: string;
}

const ERRORS = COPY.deposit.errors;

/** BtcWalletLivenessError bodies, matched (lowercased) by bucket 5b. */
const LIVENESS_BODIES = [
  COPY.wallet.liveness.unresponsive,
  COPY.wallet.liveness.emptyAddress,
  COPY.wallet.liveness.addressMismatch,
];

/**
 * Thrown by the deposit flow when the selected vault provider's commission
 * never loaded, so it can't be quoted as `maxAcceptableCommissionBps`. Used as
 * the matchable marker for the friendly `commissionUnavailable` mapping; the
 * flow refuses to submit unbound rather than risk the silent-overcharge path.
 */
export const COMMISSION_UNAVAILABLE_ERROR =
  "Vault provider commission unavailable at submit";

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

  // 3b. RFC-006 participant key drift. Distinct from the version mismatch
  // above: retrying cannot help, because the registered vault is bonded to
  // keys the prepared Pre-PegIn does not use. The copy says so rather than
  // inviting a retry.
  if (isParticipantKeyDriftError(err)) {
    return ERRORS.participantKeyDrift;
  }

  // 3c. Ethereum registration finality gate. Both cases stop the flow BEFORE
  // the Pre-PegIn is broadcast, so no Bitcoin has moved — the copy leads with
  // that, because a failure at this point looks alarming and is not.
  if (isPeginRegistrationNotFinalError(err)) {
    return ERRORS.ethRegistrationNotFinal;
  }
  if (isPeginRegistrationMissingError(err)) {
    return ERRORS.ethRegistrationMissing;
  }

  const msg = lowerMessage(err);

  // 4. Wallet account changed mid-flow (WOTS-vs-PoP key guard).
  if (msg.includes("wallet account changed")) {
    return ERRORS.walletAccountChanged;
  }

  // 4a'. Empty vault record from the registry reader. Far more often a
  // lagging RPC node than a missing vault, and the raw "not found on-chain"
  // wording reads as data loss to someone who just watched their registration
  // succeed — so surface "still confirming" instead.
  if (isVaultRecordEmptyError(err)) {
    return ERRORS.vaultRegistrationNotYetVisible;
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

  // 4c'. App build can't construct the required graph version: either the
  // WASM facade threw its stable "unsupported tx graph version ..." error
  // directly, or assertVaultCoreVersionSupported fired with the user-facing
  // body (which survives paths that stringify the error, e.g. the resume
  // broadcast surface). Both get the actionable "App update required" title.
  if (
    msg.includes("unsupported tx graph version") ||
    msg.includes(ERRORS.appVersionUnsupported.body.toLowerCase())
  ) {
    return ERRORS.appVersionUnsupported;
  }

  // 4c. VP commission drift / unavailability. The SDK throws "...commission
  // changed since quote..." when the on-chain commission rose above the quoted
  // value plus headroom; the flow throws COMMISSION_UNAVAILABLE_ERROR when the
  // commission never loaded. Both are recoverable by refreshing, so they get
  // their own titles instead of the generic fallback.
  if (msg.includes("commission changed since quote")) {
    return ERRORS.commissionChanged;
  }
  if (msg.includes(COMMISSION_UNAVAILABLE_ERROR.toLowerCase())) {
    return ERRORS.commissionUnavailable;
  }

  // 5. Wallet not connected / client unavailable. Before the stage buckets so
  // a disconnect inside a wrapped stage still reads as a wallet problem.
  if (
    msg.includes("wallet not connected") ||
    msg.includes("wallet is not connected") ||
    msg.includes("failed to get wallet client")
  ) {
    return ERRORS.walletNotConnected;
  }

  // 5b. BTC wallet liveness-probe failures. Resume surfaces stringify the
  // BtcWalletLivenessError, so match the copy strings and keep the matched
  // (actionable) body under the liveness title instead of the generic one.
  const livenessBody = LIVENESS_BODIES.find((body) =>
    msg.includes(body.toLowerCase()),
  );
  if (livenessBody) {
    return { title: COPY.wallet.liveness.errorTitle, body: livenessBody };
  }

  // 6. Wallet signing rejection. Typed rejections arrive via the stage
  // wrappers' `cause` chain; wording is the backup. Before 6b on purpose.
  //
  // Shares its vocabulary with the Sentry-side drop rather than keeping a local
  // wording list: a cancellation that telemetry correctly suppressed used to
  // fall through to generic copy here, which is the same drift on the UX side.
  if (isUserCancellation(err)) {
    return ERRORS.signingRejected;
  }

  // 6b. Non-rejection signing failure (locked wallet, stale extension,
  // device transport drop). Matches the sign-stage label.
  if (msg.includes("failed to sign pre-pegin")) {
    return ERRORS.signingFailed;
  }

  // 6c. Preparation failure — nothing signed or sent; commonly a transient
  // prevout fetch on resume, so the copy leads with retry advice.
  if (msg.includes("failed to prepare pre-pegin")) {
    return ERRORS.preparationFailed;
  }

  // 7. Broadcast failure — only the explicit "failed to broadcast" labels
  // (bare "broadcast" also appears in non-broadcast messages), and before the
  // ETH-gas bucket since the inner text can say "insufficient funds".
  if (msg.includes("failed to broadcast")) {
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
  //
  // Only this bucket carries `diagnostics`: every branch above already names
  // the cause, so the raw error adds nothing a reporter could act on. Here we
  // don't know what happened, and `sanitizeErrorMessage` has dropped viem's
  // request dump, so offer the untrimmed error for a bug report.
  const raw = sanitizeErrorMessage(err);
  return {
    title: ERRORS.defaultTitle,
    body: raw === "Unknown error" ? ERRORS.genericBody : raw,
    diagnostics: formatErrorDiagnostics(err),
  };
}
