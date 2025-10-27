/**
 * VaultActivityCard - Wrapper component that transforms VaultActivity data
 * into ActivityCard format and handles vault-specific UI logic
 *
 * Note: All state logic lives in peginStateMachine.ts (single source of truth)
 */

import { ActivityCard } from '@babylonlabs-io/core-ui';
import type { VaultActivity } from '../../types';
import type { PendingPeginRequest } from '../../storage/peginStorage';
import { usePendingPeginTxPolling } from '../../hooks/usePendingPeginTxPolling';
import { useVaultActivityActions } from '../../hooks/useVaultActivityActions';
import {
  getPeginState,
  ContractStatus,
  LocalStorageStatus,
} from '../../models/peginStateMachine';
import { buildActivityCardData } from './helpers/buildActivityCardData';

interface VaultActivityCardProps {
  activity: VaultActivity;
  connectedAddress?: string;
  btcPublicKey?: string;
  pendingPegins?: PendingPeginRequest[];
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPeginRequest['status'],
    btcTxHash?: string,
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPeginRequest, 'timestamp'>) => void;
  onRefetchActivities?: () => void;
  onShowSuccessModal?: () => void;
}

export function VaultActivityCard({
  activity,
  connectedAddress,
  btcPublicKey,
  pendingPegins = [],
  updatePendingPeginStatus,
  addPendingPegin,
  onRefetchActivities,
  onShowSuccessModal,
}: VaultActivityCardProps) {
  // Get current state from state machine (single source of truth)
  const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
  const contractStatus = activity.contractStatus as ContractStatus;
  const localStatus = pendingPegin?.status as LocalStorageStatus | undefined;
  const vaultProviderAddress = activity.providers[0]?.id as `0x${string}` | undefined;

  // Poll vault provider RPC for claim/payout transactions
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

  // Determine current state using state machine
  const peginState = getPeginState(contractStatus, localStatus, txReady);

  // Business logic hook (handles broadcast + sign)
  const {
    broadcasting,
    broadcastError,
    handleBroadcast: executeBroadcast,
    signing,
    signError,
    handleSign: executeSign,
  } = useVaultActivityActions();

  // Action handlers (thin wrappers with bound parameters)
  const handleSign = () => {
    if (!transactions || !vaultProviderAddress || !btcPublicKey || !activity.txHash || !connectedAddress) {
      return;
    }

    executeSign({
      peginTxId: activity.txHash,
      vaultProviderAddress,
      depositorBtcPubkey: btcPublicKey,
      transactions,
      activityId: activity.id,
      activityAmount: activity.collateral.amount,
      activityProviders: activity.providers,
      connectedAddress,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
    });
  };

  const handleBroadcast = () => {
    if (!connectedAddress || !onRefetchActivities || !onShowSuccessModal) {
      return;
    }

    executeBroadcast({
      activityId: activity.id,
      activityAmount: activity.collateral.amount,
      activityProviders: activity.providers,
      connectedAddress,
      pendingPegin,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    });
  };

  // Build card data (presentation helper)
  const cardData = buildActivityCardData({
    activity,
    peginState,
    actionHandlers: {
      handleSign,
      handleBroadcast,
      handleRedeem: activity.action?.onClick,
    },
    actionStates: {
      signing,
      signError,
      broadcasting,
      broadcastError,
    },
    btcPublicKey,
    txError,
  });

  return <ActivityCard data={cardData} />;
}
