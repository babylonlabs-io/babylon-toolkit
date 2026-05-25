/**
 * Pure per-deposit compute: turns a `VaultActivity` + polling inputs
 * into a `DepositPollingResult`. Provider owns React state; this owns
 * the rules — so the decision tree is testable without a React render.
 */

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
    requiredDepth,
    refundTimelock,
    isLoading,
    optimisticStatuses,
    optimisticRefundBroadcastAt,
    btcPublicKey,
  } = inputs;
  const depositId = activity.id;
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

  // FE-composite: SDK only checks "have unsigned hex?"; we also gate on
  // CSV maturity so the button never shows for a deposit Bitcoin would reject.
  const canRefund =
    !!activity.unsignedPrePeginTx && refundMaturityState === "mature";

  const peginState = getPeginState(contractStatus, {
    localStatus,
    transactionsReady,
    isInUse: activity.isInUse,
    needsWotsKey: needsWotsKey?.has(depositId),
    pendingIngestion: pendingIngestion?.has(depositId),
    prePeginBroadcastConfirmed,
    expirationReason: activity.expirationReason,
    expiredAt: activity.expiredAt,
    canRefund,
    refundMaturityState,
    refundMaturesInBlocks,
    vpTerminalError,
    refundBroadcastAt,
  });

  return {
    depositId,
    loading: isLoading,
    error: errors?.get(depositId) ?? null,
    peginState,
    isOwnedByCurrentWallet,
    depositorBtcPubkey: activity.depositorBtcPubkey,
  };
}
