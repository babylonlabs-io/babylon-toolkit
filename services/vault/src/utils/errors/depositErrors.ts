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
 *  - Vault-provider RPC — JsonRpcError from the VP (syncing, timeout, network,
 *    proxy timeout/unavailable, generic). Delegated to `mapVpRpcError`. Runs
 *    first: the VP's PEGIN_NOT_FOUND is numeric 4001, same as EIP-1193's
 *    userRejectedRequest.
 *  - Wallet rejection — user declines a signing prompt (typed top frame:
 *    EIP-1193 4001 / viem UserRejectedRequestError / CONNECTION_REJECTED; or,
 *    later and cause-walking, "user rejected" / "denied" wording).
 *  - Registered-version mismatch — protocol params rotated mid-deposit.
 *  - Ethereum registration finality — the registration never reached the
 *    required confirmation depth, or disappeared from chain state entirely.
 *  - Deposit-terms rejection — the signing device's envelope refused the
 *    terms before approval (typed SDK error; can be terminal).
 *  - Lifecycle refusal — the DepositTerms rebuild's typed status gate
 *    (broadcast stage keeps its historical broadcast-bucket copy).
 *  - Depositor wallet mismatch — the DepositTerms rebuild's typed refusal when
 *    the connected Ethereum account is not the vault's depositor.
 *  - Wallet method not supported — the connected wallet lacks a required
 *    method (coded, cause-walking; runs after every typed bucket above).
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

import {
  isDepositTermsRejectedError,
  isParticipantKeyDriftError,
  isPeginRegistrationMissingError,
  isPeginRegistrationNotFinalError,
  isRegisteredVaultVersionMismatchError,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { JsonRpcError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type ReactNode } from "react";

import { COPY } from "@/copy";

import { isDepositorWalletMismatchError } from "./depositorWalletMismatch";
import {
  DEVICE_CEREMONY_INVALID_CODE,
  DEVICE_LOCKED_CODE,
  DEVICE_WRONG_APP_CODE,
  deviceErrorCodeOfFrame,
  isDeviceCeremonyInvalidError,
  isDeviceLockedError,
  isDeviceWrongAppError,
} from "./deviceErrors";
import {
  classifyError,
  formatErrorDiagnostics,
  mapVpRpcError,
  sanitizeErrorMessage,
} from "./formatting";
import {
  isTypedUserRejectionFrame,
  isUserCancellation,
} from "./userCancellation";
import { isVaultLifecycleStateError } from "./vaultLifecycleStateError";
import { isVaultRecordEmptyError } from "./vaultRecordEmpty";
import { isWalletMethodNotSupported } from "./walletMethodNotSupported";

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

/**
 * Mapped buckets a registered deposit can resume from in the modal. Keyed by
 * identity: mapDepositError returns these COPY references, never copies.
 */
const RESUMABLE_AFTER_REGISTRATION: ReadonlySet<DepositErrorContent> = new Set([
  ERRORS.deviceLocked,
  ERRORS.deviceWrongApp,
  ERRORS.deviceCeremonyInvalid,
  ERRORS.signingRejected,
]);

export function isResumableDepositError(content: DepositErrorContent): boolean {
  return RESUMABLE_AFTER_REGISTRATION.has(content);
}

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
  // 1. Vault-provider JSON-RPC errors — reuse the shared VP mapping. Must
  // run before the typed-rejection check: the VP's PEGIN_NOT_FOUND is the
  // numeric code 4001, which EIP-1193 also uses for userRejectedRequest.
  if (err instanceof JsonRpcError) {
    const { title, message } = mapVpRpcError(err);
    return { title, body: message };
  }

  // 2. Typed top-frame user rejection (EIP-1193 4001, viem, wallet-connector
  // code) — most specific wallet signal. Top frame only; the cause-walking
  // wording check is step 6, deliberately below the typed buckets.
  if (isTypedUserRejectionFrame(err)) {
    return ERRORS.signingRejected;
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

  // 3d. Device-envelope rejection of the deposit terms. Can be terminal for
  // this deposit, so the copy points at support instead of a retry.
  if (isDepositTermsRejectedError(err)) {
    return ERRORS.depositTermsRejected;
  }

  // 3e. Typed lifecycle refusal from the DepositTerms rebuild. The broadcast
  // stage keeps the copy its generic-message predecessor landed on (the old
  // message contained "broadcast", so it hit the broadcast bucket below).
  if (isVaultLifecycleStateError(err) && err.stage === "broadcast") {
    return ERRORS.broadcastFailed;
  }

  // 3f. Typed depositor-wallet refusal from the DepositTerms rebuild.
  if (isDepositorWalletMismatchError(err)) {
    return ERRORS.wrongDepositorWallet;
  }

  // 3g'. Top-frame device code — before both cause walks, so an outer device
  // error is never shadowed by an inner cause (same contract as step 2).
  switch (deviceErrorCodeOfFrame(err)) {
    case DEVICE_CEREMONY_INVALID_CODE:
      return ERRORS.deviceCeremonyInvalid;
    case DEVICE_LOCKED_CODE:
      return ERRORS.deviceLocked;
    case DEVICE_WRONG_APP_CODE:
      return ERRORS.deviceWrongApp;
  }

  // 3g. Wallet lacks a required method. Cause-walking, so it must run AFTER
  // every typed bucket above — an inner unsupported-method code must never
  // override a meaningful outer wallet/VP/contract error (step 2 already
  // claimed any typed top-frame rejection).
  if (isWalletMethodNotSupported(err)) {
    return ERRORS.walletMethodNotSupported;
  }

  // 3h. Device codes nested in a cause chain — must beat the message buckets
  // (a broadcast wrapper's wording would otherwise claim them).
  if (isDeviceCeremonyInvalidError(err)) {
    return ERRORS.deviceCeremonyInvalid;
  }
  if (isDeviceLockedError(err)) {
    return ERRORS.deviceLocked;
  }
  if (isDeviceWrongAppError(err)) {
    return ERRORS.deviceWrongApp;
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

  // 5b. BTC wallet liveness-probe failures. Resume surfaces stringify the
  // BtcWalletLivenessError, so match the copy strings and keep the matched
  // (actionable) body under the liveness title instead of the generic one.
  const livenessBody = LIVENESS_BODIES.find((body) =>
    msg.includes(body.toLowerCase()),
  );
  if (livenessBody) {
    return { title: COPY.wallet.liveness.errorTitle, body: livenessBody };
  }

  // 6. Wallet signing rejection. The typed path (step 2) checks only the
  // top-level frame, so it misses rejections the broadcast step re-wrapped;
  // this cause-walking check catches them by wording or by the coded inner
  // frame the wrapper now preserves as `cause`. Checked before the broadcast
  // bucket so "Failed to broadcast ...: user rejected" reads as a rejection.
  //
  // Shares its vocabulary with the Sentry-side drop rather than keeping a local
  // wording list: a cancellation that telemetry correctly suppressed used to
  // fall through to generic copy here, which is the same drift on the UX side.
  if (isUserCancellation(err)) {
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
