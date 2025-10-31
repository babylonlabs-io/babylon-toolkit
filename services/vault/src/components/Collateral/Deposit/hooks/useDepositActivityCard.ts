/**
 * useDepositActivityCard Hook
 * Encapsulates business logic for DepositActivityCard component
 */

import { useMemo } from "react";

import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
  PeginAction,
} from "../../../../models/peginStateMachine";
import type { VaultActivity } from "../../../../types/activity";
import type { PendingPeginRequest } from "../storage/peginStorage";

import { usePendingPeginTxPolling } from "./usePendingPeginTxPolling";
import { useVaultActivityActions } from "./useVaultActivityActions";

export interface UseDepositActivityCardParams {
  activity: VaultActivity;
  connectedAddress?: string;
  btcPublicKey?: string;
  pendingPegins?: PendingPeginRequest[];
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPeginRequest["status"],
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPeginRequest, "timestamp">) => void;
  onRefetchActivities?: () => void;
  onShowSuccessModal?: () => void;
}

export interface UseDepositActivityCardReturn {
  // State machine state
  peginState: ReturnType<typeof getPeginState>;

  // Action buttons
  actions: Array<{ name: string; action: string }>;

  // Details data (component handles JSX rendering)
  detailsData: {
    vaultProviderName: string;
    hasError: boolean;
    errorMessages: string[];
    infoMessage?: string;
  };

  // Action handler
  handleAction: (id: string, action: string) => void;

  // Loading states
  signing: boolean;
  broadcasting: boolean;

  // Error states
  txError: Error | null;
  signError: string | null;
  broadcastError: string | null;
}

export function useDepositActivityCard(
  params: UseDepositActivityCardParams,
): UseDepositActivityCardReturn {
  const {
    activity,
    connectedAddress,
    btcPublicKey,
    pendingPegins = [],
    updatePendingPeginStatus,
    addPendingPegin,
    onRefetchActivities,
    onShowSuccessModal,
  } = params;

  const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
  const contractStatus = activity.contractStatus as ContractStatus;
  const localStatus = pendingPegin?.status as LocalStorageStatus | undefined;
  const vaultProviderAddress = activity.providers[0]?.id as
    | `0x${string}`
    | undefined;
  const shouldPoll =
    contractStatus === ContractStatus.PENDING &&
    localStatus !== LocalStorageStatus.PAYOUT_SIGNED;

  const {
    transactions,
    error: txError,
    isReady: txReady,
  } = usePendingPeginTxPolling(
    shouldPoll && btcPublicKey && vaultProviderAddress && activity.txHash
      ? {
          peginTxId: activity.txHash,
          vaultProviderAddress,
          depositorBtcPubkey: btcPublicKey,
        }
      : null,
  );

  const peginState = getPeginState(contractStatus, localStatus, txReady);

  const {
    broadcasting,
    broadcastError,
    handleBroadcast: executeBroadcast,
    signing,
    signError,
    handleSign: executeSign,
  } = useVaultActivityActions();

  const handleSign = () => {
    if (
      !transactions ||
      !vaultProviderAddress ||
      !btcPublicKey ||
      !activity.txHash ||
      !connectedAddress
    ) {
      return;
    }

    executeSign({
      peginTxId: activity.txHash,
      vaultProviderAddress,
      depositorBtcPubkey: btcPublicKey,
      transactions,
      activityId: activity.id,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
    });
  };

  const handleBroadcast = () => {
    if (!connectedAddress) return;

    executeBroadcast({
      activityId: activity.id,
      pendingPegin,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities: onRefetchActivities || (() => {}),
      onShowSuccessModal: onShowSuccessModal || (() => {}),
    });
  };

  const actions = useMemo(() => {
    const actionButtons: Array<{ name: string; action: string }> = [];

    if (
      peginState.availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)
    ) {
      actionButtons.push({
        name: signing
          ? "Signing..."
          : signError
            ? "Retry Sign"
            : "Sign Payout Transactions",
        action: "sign",
      });
    }

    if (
      peginState.availableActions.includes(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      )
    ) {
      actionButtons.push({
        name: broadcasting
          ? "Broadcasting..."
          : broadcastError
            ? "Retry Broadcast"
            : "Sign & Broadcast to Bitcoin",
        action: "broadcast",
      });
    }

    if (activity.action) {
      actionButtons.push({
        name: activity.action.label,
        action: "redeem",
      });
    }

    return actionButtons;
  }, [
    peginState,
    signing,
    signError,
    broadcasting,
    broadcastError,
    activity.action,
  ]);

  const detailsData = useMemo(() => {
    const errorMessages: string[] = [];

    if (txError) {
      errorMessages.push(`Failed to fetch transactions: ${txError.message}`);
    }
    if (signError) {
      errorMessages.push(signError);
    }
    if (broadcastError) {
      errorMessages.push(broadcastError);
    }

    return {
      vaultProviderName: activity.providers[0]?.name || "Unknown",
      hasError: errorMessages.length > 0,
      errorMessages,
      infoMessage:
        peginState.message && errorMessages.length === 0
          ? peginState.message
          : undefined,
    };
  }, [peginState, txError, signError, broadcastError, activity.providers]);

  const handleAction = (_id: string, action: string) => {
    if (action === "sign") {
      handleSign();
    } else if (action === "broadcast") {
      handleBroadcast();
    } else if (action === "redeem" && activity.action) {
      activity.action.onClick();
    }
  };

  return {
    peginState,
    actions,
    detailsData,
    handleAction,
    signing,
    broadcasting,
    txError,
    signError,
    broadcastError,
  };
}
