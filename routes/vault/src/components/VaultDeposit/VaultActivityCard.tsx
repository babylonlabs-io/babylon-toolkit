/**
 * VaultActivityCard - Wrapper component that transforms VaultActivity data
 * into ActivityCard format and handles vault-specific UI logic
 */

import { useState } from 'react';
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

interface VaultActivityCardProps {
  activity: VaultActivity;
  connectedAddress?: string;
  pendingPegins?: PendingPeginRequest[];
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPeginRequest['status'],
    btcTxHash?: string,
  ) => void;
  onRefetchActivities?: () => void;
  onShowSuccessModal?: () => void;
}

export function VaultActivityCard({
  activity,
  connectedAddress,
  pendingPegins = [],
  updatePendingPeginStatus,
  onRefetchActivities,
  onShowSuccessModal,
}: VaultActivityCardProps) {
  // Note: Actions (Borrow/Repay) are now handled in VaultPositions tab
  // This component only displays vault deposit information

  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const btcConnector = useChainConnector('BTC');

  // Broadcast handler
  const handleBroadcast = async () => {
    if (!connectedAddress || !onRefetchActivities || !onShowSuccessModal)
      return;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Get pending pegin from passed data (no longer fetching from localStorage directly)
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

      if (!pendingPegin?.unsignedTxHex || !pendingPegin?.utxo) {
        throw new Error(
          'Missing transaction data. Please try depositing again.',
        );
      }

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error(
          'BTC wallet not connected. Please reconnect your wallet.',
        );
      }

      // Broadcast the transaction
      const txId = await broadcastPeginTransaction({
        unsignedTxHex: pendingPegin.unsignedTxHex,
        utxo: {
          txid: pendingPegin.utxo.txid,
          vout: pendingPegin.utxo.vout,
          value: BigInt(pendingPegin.utxo.value),
          scriptPubKey: pendingPegin.utxo.scriptPubKey,
        },
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      // Update localStorage status using hook (triggers re-render)
      if (updatePendingPeginStatus) {
        updatePendingPeginStatus(activity.id, 'confirming', txId);
      }

      // Show success modal & refetch blockchain data
      onShowSuccessModal();
      onRefetchActivities();

      setBroadcasting(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to broadcast transaction';
      setBroadcastError(errorMessage);
      setBroadcasting(false);
    }
  };

  // Determine status to display:
  // - If vault is in use (vaultMetadata.active=true), show "In Position"
  // - Otherwise show the actual pegin status (from localStorage or blockchain)
  const displayStatus = activity.vaultMetadata?.active
    ? { label: 'In Position', variant: 'active' as const }
    : activity.status;

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

  // Check if this is a verified vault (ready for BTC broadcast)
  const isVerified = activity.status.label === 'Verified';
  const canBroadcast =
    isVerified && connectedAddress && onRefetchActivities && onShowSuccessModal;

  // Transform to ActivityCardData format
  // NOTE: optionalDetails (loan details) are now only shown in VaultPositions tab
  // This card only shows vault deposit/collateral information
  const cardData: ActivityCardData = {
    formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
    icon: activity.collateral.icon || bitcoinIcon,
    iconAlt: activity.collateral.symbol,
    details,
    // Add warning for pending peg-ins or broadcast errors
    warning:
      activity.isPending && activity.pendingMessage ? (
        <Warning>{activity.pendingMessage}</Warning>
      ) : broadcastError ? (
        <Warning>{broadcastError}</Warning>
      ) : undefined,
    // Show broadcast button for verified vaults, otherwise show action button
    primaryAction: canBroadcast
      ? {
          label: broadcasting
            ? 'Broadcasting...'
            : broadcastError
              ? 'Retry Broadcast'
              : 'Broadcast to Bitcoin',
          onClick: handleBroadcast,
          variant: 'contained' as const,
          fullWidth: true,
        }
      : activity.action
        ? {
            label: activity.action.label,
            onClick: activity.action.onClick,
          }
        : undefined,
  };

  return <ActivityCard data={cardData} />;
}
