/**
 * Hook for managing broadcast state and logic.
 *
 * Analogous to usePayoutSigningState for the broadcast flow.
 * Encapsulates useVaultActions + usePeginStorage + usePeginPolling
 * so the component stays a thin view layer.
 *
 * Note: onSuccess() triggers parent unmount (setBroadcastingActivity(null))
 * so there is no isComplete state — the parent multistepper refetches and
 * advances to the next step.
 */

import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useCallback, useState } from "react";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { logger } from "@/infrastructure";
import { shortId, TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { RegistrationDepthProgress } from "@/services/vault/ethConfirmationGate";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";
import type { DepositErrorContent } from "@/utils/errors";
import { sameHex } from "@/utils/hex";

import { useVaultActions } from "./useVaultActions";

/** Stable empty array to avoid re-render cascades in usePeginStorage. */
const EMPTY_CONFIRMED: VaultActivity[] = [];

export interface UseBroadcastStateProps {
  activity: VaultActivity;
  /**
   * Every vault ID believed to share this Pre-PegIn transaction (batched
   * pegin). Includes `activity.id`. Hex-inferred, so only the ids the
   * broadcast proves on chain are marked CONFIRMING on success.
   */
  batchVaultIds: string[];
  depositorEthAddress: string;
  /** Receives the `batchVaultIds` entries the broadcast proved on chain. */
  onSuccess: (confirmedVaultIds: readonly string[]) => void;
}

export interface UseBroadcastStateResult {
  /** Whether a broadcast is in progress */
  broadcasting: boolean;
  /** Broadcast failure, already classified into user-facing copy. */
  error: DepositErrorContent | null;
  /**
   * Live Ethereum confirmation depth while the finality gate holds this
   * broadcast. `null` for any deposit already past the required depth, which
   * is nearly every resume.
   */
  ethConfirmationDetail: RegistrationDepthProgress | null;
  /** Handler to initiate broadcast */
  handleBroadcast: () => Promise<void>;
}

export function useBroadcastState({
  activity,
  batchVaultIds,
  depositorEthAddress,
  onSuccess,
}: UseBroadcastStateProps): UseBroadcastStateResult {
  const {
    broadcasting: vaultBroadcasting,
    broadcastError,
    ethConfirmationDetail,
    handleBroadcast: vaultHandleBroadcast,
  } = useVaultActions();
  const [localBroadcasting, setLocalBroadcasting] = useState(false);

  const { setOptimisticStatus } = usePeginPolling();
  const { pendingPegins, updatePendingPeginStatus, removePendingPegin } =
    usePeginStorage({
      ethAddress: depositorEthAddress,
      confirmedPegins: EMPTY_CONFIRMED,
    });

  const handleBroadcast = useCallback(async () => {
    // Resolve pendingPegin at call time to avoid stale closure references.
    // Every sibling's record holds the same transaction, UTXOs, build versions
    // and key stamp, and a deposit keeps going when one record fails to save,
    // so a sibling's record stands in when the clicked vault has none. The
    // broadcast still compares its transaction with the clicked vault's.
    let pendingPegin = pendingPegins.find((p) => p.id === activity.id);
    if (pendingPegin === undefined) {
      pendingPegin = pendingPegins.find((p) => batchVaultIds.includes(p.id));
    }

    setLocalBroadcasting(true);
    try {
      await vaultHandleBroadcast({
        vaultId: activity.id,
        // The ids are vault ids widened to string by the props; this only
        // restores the Hex type the capacity check reads them with.
        batchVaultIds: batchVaultIds.map((id) => ensureHexPrefix(id)),
        depositorEthAddress,
        pendingPegin,
        updatePendingPeginStatus,
        removePendingPegin,
        onRefetchActivities: () => {
          // No-op: onSuccess() lets the parent multistepper refetch and advance.
          // The polling context handles periodic refetching, and the optimistic
          // status update below provides immediate UI feedback.
        },
        onShowSuccessModal: ({ confirmedVaultIds }) => {
          // Walk the prop, not the verified set: the prop strings are the
          // storage keys, and a listed stranger must keep its Broadcast button.
          const confirmedIds = batchVaultIds.filter((id) =>
            confirmedVaultIds.some((confirmed) => sameHex(id, confirmed)),
          );
          for (const id of confirmedIds) {
            updatePendingPeginStatus(id, LocalStorageStatus.CONFIRMING);
            setOptimisticStatus(id, LocalStorageStatus.CONFIRMING);
            // Per vault (scalar vaultId), matching the inline path.
            logger.event(TELEMETRY_EVENT.DEPOSIT_BROADCAST_SUCCEEDED, {
              level: "info",
              category: "deposit",
              tags: { vaultId: shortId(id) },
              vaultCount: confirmedIds.length,
            });
          }
          setLocalBroadcasting(false);
          onSuccess(confirmedIds);
        },
      });
    } catch (err) {
      logger.error(err, {
        data: { context: "Broadcast failed" },
      });
      setLocalBroadcasting(false);
    }
  }, [
    activity,
    batchVaultIds,
    depositorEthAddress,
    pendingPegins,
    updatePendingPeginStatus,
    removePendingPegin,
    vaultHandleBroadcast,
    setOptimisticStatus,
    onSuccess,
  ]);

  const isBroadcasting =
    (vaultBroadcasting || localBroadcasting) && !broadcastError;

  return {
    broadcasting: isBroadcasting,
    error: broadcastError,
    ethConfirmationDetail,
    handleBroadcast,
  };
}
