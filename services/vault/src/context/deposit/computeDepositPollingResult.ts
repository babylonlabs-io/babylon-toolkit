/**
 * Pure per-deposit compute: turns a `VaultActivity` + polling inputs
 * into a `DepositPollingResult`. Provider owns React state; this owns
 * the rules — so the decision tree is testable without a React render.
 */

import type { HtlcSpend } from "../../clients/btc/outspend";
import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
  type RefundMaturityState,
} from "../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { VaultActivity } from "../../types/activity";
import type { DepositPollingResult } from "../../types/peginPolling";
import { isTerminalPollingError } from "../../utils/peginPolling";
import { canonicalizeTxid } from "../../utils/txid";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";

/** Optimistic override wins over persisted `pendingPegins` status. */
function resolveLocalStatus(
  depositId: string,
  optimisticStatuses: Map<string, LocalStorageStatus>,
  pendingPegins: PendingPeginRequest[],
): LocalStorageStatus | undefined {
  const pendingPegin = pendingPegins.find((p) => p.id === depositId);
  const optimistic = optimisticStatuses.get(depositId);
  return (optimistic ?? pendingPegin?.status) as LocalStorageStatus | undefined;
}

/**
 * Anchors the REFUND_BROADCAST suppression TTL. Optimistic timestamp
 * covers the gap before localStorage is read back.
 */
function resolveRefundBroadcastAt(
  depositId: string,
  optimisticRefundBroadcastAt: Map<string, number>,
  pendingPegins: PendingPeginRequest[],
): number | undefined {
  return (
    optimisticRefundBroadcastAt.get(depositId) ??
    pendingPegins.find((p) => p.id === depositId)?.refundBroadcastAt
  );
}

export interface DepositPollingInputs {
  activity: VaultActivity;
  pendingPegins: PendingPeginRequest[];
  pendingDepositorSignatures: Set<string> | undefined;
  errors: Map<string, Error> | undefined;
  needsWotsKey: Set<string> | undefined;
  pendingIngestion: Set<string> | undefined;
  prePeginConfirmationsByTxid: Map<string, number>;
  confirmedTxids: Set<string>;
  matureRefundTxids: Set<string>;
  /**
   * Live HTLC spend status keyed by lowercased vault id, from the EXPIRED
   * `outspend` poll. A spent HTLC means the refund already landed.
   */
  htlcRefundByDepositId: Map<string, HtlcSpend>;
  /**
   * Lowercased vault ids whose HTLC spend confirmed (cached; dropped from the
   * live poll). OR'd with the live map so a confirmed refund stays settled
   * after the txid leaves the poll set.
   */
  refundedHtlcVaultIds: Set<string>;
  /** Per-vault min depth, pre-resolved from `offchainParamsVersion`. */
  requiredDepth: number;
  /** Per-vault `tRefund`; `undefined` collapses maturity to `unknown`. */
  refundTimelock: number | undefined;
  isLoading: boolean;
  optimisticStatuses: Map<string, LocalStorageStatus>;
  optimisticRefundBroadcastAt: Map<string, number>;
  btcPublicKey: string | undefined;
}

export function computeDepositPollingResult(
  inputs: DepositPollingInputs,
): DepositPollingResult {
  const {
    activity,
    pendingPegins,
    pendingDepositorSignatures,
    errors,
    needsWotsKey,
    pendingIngestion,
    prePeginConfirmationsByTxid,
    confirmedTxids,
    matureRefundTxids,
    htlcRefundByDepositId,
    refundedHtlcVaultIds,
    requiredDepth,
    refundTimelock,
    isLoading,
    optimisticStatuses,
    optimisticRefundBroadcastAt,
    btcPublicKey,
  } = inputs;
  const depositId = activity.id;
  const depositIdKey = depositId.toLowerCase();
  const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
  const localStatus = resolveLocalStatus(
    depositId,
    optimisticStatuses,
    pendingPegins,
  );
  const refundBroadcastAt = resolveRefundBroadcastAt(
    depositId,
    optimisticRefundBroadcastAt,
    pendingPegins,
  );

  const depositError = errors?.get(depositId);
  const vpTerminalError =
    depositError && isTerminalPollingError(depositError)
      ? depositError.message
      : undefined;

  const justSignedPayoutsThisSession =
    optimisticStatuses.get(depositId) === LocalStorageStatus.PAYOUT_SIGNED;
  const transactionsReady = justSignedPayoutsThisSession
    ? false
    : (pendingDepositorSignatures?.has(depositId) ?? false);

  // Cache is OR'd with live count: on refresh, cached txids are
  // filtered out of polling, so the live map is empty for them.
  const prePeginCanonical = canonicalizeTxid(activity.prePeginTxHash);
  const cachedAtDepth = prePeginCanonical
    ? confirmedTxids.has(prePeginCanonical)
    : false;
  const confirmations = prePeginCanonical
    ? prePeginConfirmationsByTxid.get(prePeginCanonical)
    : undefined;
  const prePeginBroadcastConfirmed =
    cachedAtDepth ||
    (confirmations !== undefined && confirmations >= requiredDepth);
  // Chain ground truth that the Pre-PegIn was broadcast at all: a present
  // confirmation entry — or a cached at-depth observation — means the tx is on
  // the network. Independent of localStorage, so every tab converges on the
  // same status instead of re-offering "Broadcast" in a tab that lacks the
  // local CONFIRMING marker. Self-heals: an evicted/dropped tx drops the entry.
  const prePeginBroadcastSeen = cachedAtDepth || confirmations !== undefined;

  const isOwnedByCurrentWallet = isVaultOwnedByWallet(
    activity.depositorBtcPubkey,
    btcPublicKey,
  );

  // EXPIRED maturity. Strict: `mature` only when CSV satisfied; missing
  // inputs → `unknown` (never false-positive). Bypass for unowned (so
  // action surfaces → ownership-mismatch tooltip takes over) and for
  // cache-hit (polling drops mature txids, live map is empty on refresh).
  const cachedMature = prePeginCanonical
    ? matureRefundTxids.has(prePeginCanonical)
    : false;
  let refundMaturityState: RefundMaturityState | undefined;
  let refundMaturesInBlocks: number | undefined;
  if (contractStatus === ContractStatus.EXPIRED) {
    if (!isOwnedByCurrentWallet || cachedMature) {
      refundMaturityState = "mature";
    } else if (confirmations !== undefined && refundTimelock !== undefined) {
      if (confirmations >= refundTimelock) {
        refundMaturityState = "mature";
      } else {
        refundMaturityState = "maturing";
        refundMaturesInBlocks = refundTimelock - confirmations;
      }
    } else {
      refundMaturityState = "unknown";
    }
  }

  // Chain ground truth: has the HTLC output already been spent (refund landed)?
  // Cached confirmed-refunds OR the live poll. A confirmed spend is terminal;
  // a spent-but-unconfirmed one is a pending refund. Either way the refund is
  // no longer available — re-broadcasting would hit Bitcoin's -27/-25.
  const liveRefund = htlcRefundByDepositId.get(depositIdKey);
  const refundConfirmed =
    refundedHtlcVaultIds.has(depositIdKey) || liveRefund?.confirmed === true;
  const refundPending = !refundConfirmed && liveRefund?.spent === true;
  const refundSettlement: "confirmed" | "pending" | undefined = refundConfirmed
    ? "confirmed"
    : refundPending
      ? "pending"
      : undefined;

  // FE-composite: SDK only checks "have unsigned hex?"; we also gate on
  // CSV maturity so the button never shows for a deposit Bitcoin would reject,
  // and on the HTLC not already being spent (settled refund).
  const canRefund =
    !!activity.unsignedPrePeginTx &&
    refundMaturityState === "mature" &&
    refundSettlement === undefined;

  const peginState = getPeginState(contractStatus, {
    localStatus,
    transactionsReady,
    isInUse: activity.isInUse,
    needsWotsKey: needsWotsKey?.has(depositId),
    pendingIngestion: pendingIngestion?.has(depositId),
    prePeginBroadcastConfirmed,
    prePeginBroadcastSeen,
    expirationReason: activity.expirationReason,
    expiredAt: activity.expiredAt,
    canRefund,
    refundMaturityState,
    refundMaturesInBlocks,
    refundSettlement,
    vpTerminalError,
    refundBroadcastAt,
  });

  // Coalesce cached at-depth observations into the live count: once a tx
  // crossed `requiredDepth`, polling drops it from the live map (depth never
  // rewinds), so on refresh `confirmations` is undefined even though the tx
  // is past depth. Treat that as "at least requiredDepth" so consumers don't
  // see a regression.
  const reportedConfirmations =
    confirmations ?? (cachedAtDepth ? requiredDepth : null);

  return {
    depositId,
    loading: isLoading,
    error: errors?.get(depositId) ?? null,
    peginState,
    isOwnedByCurrentWallet,
    depositorBtcPubkey: activity.depositorBtcPubkey,
    prePeginConfirmations: reportedConfirmations,
    requiredPrePeginDepth: requiredDepth,
  };
}
