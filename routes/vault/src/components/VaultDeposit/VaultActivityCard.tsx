/**
 * VaultActivityCard - Wrapper component that transforms VaultActivity data
 * into ActivityCard format and handles vault-specific UI logic
 */

import { useState } from 'react';
import type { Hex } from 'viem';
import {
  ActivityCard,
  StatusBadge,
  ProviderItem,
  Warning,
  type ActivityCardData,
  type ActivityCardDetailItem,
} from '@babylonlabs-io/core-ui';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import type { VaultActivity } from '../../mockData/vaultActivities';
import { bitcoinIcon } from '../../assets';
import { Hash } from '../Hash';
import { broadcastPeginTransaction } from '../../services/btc/broadcastService';
import { type PendingPeginRequest } from '../../storage/peginStorage';
import { getPeginRequest } from '../../clients/eth-contract/btc-vaults-manager/query';
import { CONTRACTS } from '../../config/contracts';
import { usePendingPeginTxPolling } from '../../hooks/usePendingPeginTxPolling';
import { useSignPeginTransactions } from '../../hooks/useSignPeginTransactions';
import {
  getPeginState,
  getPrimaryActionButton,
  getNextLocalStatus,
  PeginAction,
  ContractStatus,
  LocalStorageStatus,
} from '../../models/peginStateMachine';

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
  // Note: Actions (Borrow/Repay) are now handled in VaultPositions tab
  // This component only displays vault deposit information

  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const btcConnector = useChainConnector('BTC');

  // Get current state from state machine
  const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
  const contractStatus = activity.contractStatus as ContractStatus;
  const localStatus = pendingPegin?.status as LocalStorageStatus | undefined;

  // Get vault provider address from activity
  const vaultProviderAddress = activity.providers[0]?.id as `0x${string}` | undefined;

  // Poll vault provider RPC for claim/payout transactions
  // Only poll when status is PENDING
  const shouldPoll = contractStatus === ContractStatus.PENDING
    && localStatus !== LocalStorageStatus.PAYOUT_SIGNED;

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
      : null
  );

  // Determine current state using state machine
  const peginState = getPeginState(contractStatus, localStatus, txReady);

  // Hook for signing payout transactions
  const { signPayoutsAndSubmit } = useSignPeginTransactions();

  // Broadcast handler
  const handleBroadcast = async () => {
    if (!connectedAddress || !onRefetchActivities || !onShowSuccessModal)
      return;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch pegin request from BTCVaultsManager contract (enables cross-device broadcasting)
      const peginRequest = await getPeginRequest(
        CONTRACTS.BTC_VAULTS_MANAGER,
        activity.id as Hex,
      );

      const unsignedTxHex = peginRequest.unsignedBtcTx;

      if (!unsignedTxHex) {
        throw new Error(
          'Unsigned transaction not found in contract. Please try again.',
        );
      }

      // Try to get UTXO from localStorage (optional cache for performance)
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
      const cachedUtxo = pendingPegin?.utxo
        ? {
            txid: pendingPegin.utxo.txid,
            vout: pendingPegin.utxo.vout,
            value: BigInt(pendingPegin.utxo.value),
            scriptPubKey: pendingPegin.utxo.scriptPubKey,
          }
        : undefined;

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error(
          'BTC wallet not connected. Please reconnect your wallet.',
        );
      }

      // Broadcast the transaction
      // If cachedUtxo is undefined, broadcastService will derive it from mempool
      const txId = await broadcastPeginTransaction({
        unsignedTxHex,
        utxo: cachedUtxo, // Optional: uses cache if available, derives if not
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      // Update or create localStorage entry to show "Pending BTC Confirmations" status
      // Use state machine to determine next status
      const nextStatus = getNextLocalStatus(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN);
      let localStorageCreated = false; // Track if we created new entry

      if (pendingPegin && updatePendingPeginStatus && nextStatus) {
        // Case 1: localStorage entry EXISTS - update it
        updatePendingPeginStatus(activity.id, nextStatus, txId);
      } else if (addPendingPegin && connectedAddress && nextStatus) {
        // Case 2: NO localStorage entry (cross-device) - create one
        // This ensures UI shows "Pending BTC Confirmations" status after broadcast
        const btcAddress = btcConnector?.connectedWallet?.account?.address;

        // Prepare UTXO data if it was derived (might be undefined)
        const utxoForStorage = cachedUtxo
          ? {
              txid: cachedUtxo.txid,
              vout: cachedUtxo.vout,
              value: cachedUtxo.value.toString(),
              scriptPubKey: cachedUtxo.scriptPubKey,
            }
          : undefined;

        addPendingPegin({
          id: activity.id,
          amount: activity.collateral.amount,
          providers: activity.providers.map((p) => p.id),
          ethAddress: connectedAddress,
          btcAddress: btcAddress || '',
          unsignedTxHex: unsignedTxHex,
          utxo: utxoForStorage,
          btcTxHash: txId,
          status: nextStatus,
        });

        localStorageCreated = true; // Mark that we created entry
      }

      // Show success modal
      onShowSuccessModal();

      // Only refetch if we UPDATED existing entry (not created new one)
      // Creating new entry triggers re-render automatically via localStorage state change
      if (!localStorageCreated) {
        onRefetchActivities();
      }

      setBroadcasting(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to broadcast transaction';
      setBroadcastError(errorMessage);
      setBroadcasting(false);
    }
  };

  // Sign handler for payout transactions
  const handleSign = async () => {
    if (!transactions || !vaultProviderAddress || !btcPublicKey || !activity.txHash) {
      return;
    }

    // Get BTC wallet provider
    const btcWalletProvider = btcConnector?.connectedWallet?.provider;
    if (!btcWalletProvider) {
      setSignError('BTC wallet not connected. Please reconnect your wallet.');
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      await signPayoutsAndSubmit({
        peginTxId: activity.txHash,
        vaultProviderAddress,
        // Depositor's BTC public key (x-only, 32 bytes, no 0x prefix)
        depositorBtcPubkey: btcPublicKey,
        transactions,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      // Update localStorage status using state machine
      const nextStatus = getNextLocalStatus(PeginAction.SIGN_PAYOUT_TRANSACTIONS);
      if (updatePendingPeginStatus && nextStatus) {
        updatePendingPeginStatus(activity.id, nextStatus);
      }

      // Refetch activities after successful submission
      if (onRefetchActivities) {
        onRefetchActivities();
      }

      setSigning(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to sign transactions';
      setSignError(errorMessage);
      setSigning(false);
    }
  };

  // Determine status to display using state machine
  // If vault is in use (vaultMetadata.active=true), override with "In Position"
  const displayStatus = activity.vaultMetadata?.active
    ? { label: 'In Position', variant: 'active' as const }
    : { label: peginState.displayLabel, variant: peginState.displayVariant };

  // Build status detail with StatusBadge
  const statusDetail: ActivityCardDetailItem = {
    label: 'Status',
    value: (
      <StatusBadge
        status={displayStatus.variant as 'active' | 'inactive' | 'pending'}
        label={displayStatus.label}
      />
    ),
  };

  // Build providers detail with ProviderItem elements
  const providersDetail: ActivityCardDetailItem = {
    label: 'Vault Provider(s)',
    value: (
      <div className="flex flex-wrap gap-2">
        {activity.providers.map((provider) => (
          <ProviderItem
            key={provider.id}
            name={provider.name}
            icon={provider.icon}
          />
        ))}
      </div>
    ),
  };

  // Build pegInTxHash detail (for debugging) - with trim and copy functionality
  const txHashDetail: ActivityCardDetailItem | null = activity.txHash
    ? {
        label: 'PegIn Tx Hash',
        value: <Hash value={activity.txHash} symbols={12} />,
      }
    : null;

  // Build main details array (removed separate "Usage Status" field)
  const details: ActivityCardDetailItem[] = [
    statusDetail,
    providersDetail,
    ...(txHashDetail ? [txHashDetail] : []),
  ];

  // Determine primary action using state machine
  let primaryAction: ActivityCardData['primaryAction'] = undefined;
  const primaryActionConfig = getPrimaryActionButton(peginState);

  if (primaryActionConfig) {
    const { label, action } = primaryActionConfig;

    // Map action to handler
    let onClick: (() => void) | undefined;
    let displayLabel = label;

    if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      onClick = handleSign;
      displayLabel = signing ? 'Signing...' : signError ? 'Retry Sign' : label;
    } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onClick = handleBroadcast;
      displayLabel = broadcasting ? 'Broadcasting...' : broadcastError ? 'Retry Sign & Broadcast' : label;
    } else if (action === PeginAction.REDEEM && activity.action) {
      onClick = activity.action.onClick;
      displayLabel = activity.action.label;
    }

    if (onClick) {
      primaryAction = {
        label: displayLabel,
        onClick,
        variant: 'contained' as const,
        fullWidth: true,
      };
    }
  }

  // Transform to ActivityCardData format
  // NOTE: optionalDetails (loan details) are now only shown in VaultPositions tab
  // This card only shows vault deposit/collateral information
  const cardData: ActivityCardData = {
    formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
    icon: activity.collateral.icon || bitcoinIcon,
    iconAlt: activity.collateral.symbol,
    details,
    // Add warning messages based on state or errors
    warning:
      activity.isPending && activity.pendingMessage ? (
        <Warning>{activity.pendingMessage}</Warning>
      ) : contractStatus === ContractStatus.PENDING && !btcPublicKey ? (
        <Warning>Unable to get BTC public key from wallet. Please reconnect your BTC wallet.</Warning>
      ) : txError ? (
        <Warning>Failed to fetch transactions: {txError.message}</Warning>
      ) : signError ? (
        <Warning>{signError}</Warning>
      ) : broadcastError ? (
        <Warning>{broadcastError}</Warning>
      ) : peginState.message ? (
        <Warning>{peginState.message}</Warning>
      ) : undefined,
    primaryAction,
  };

  return <ActivityCard data={cardData} />;
}
