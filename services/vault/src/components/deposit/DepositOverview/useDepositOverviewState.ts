/**
 * useDepositOverviewState Hook
 *
 * Manages all state and data fetching for the DepositOverview component.
 * Extracts business logic from the UI component for better separation of concerns.
 */

import { useMemo } from "react";

import { getApplicationMetadataByController } from "../../../applications";
import { useVaultRedeemState } from "../../../context/deposit/VaultRedeemState";
import { useBTCWallet, useETHWallet } from "../../../context/wallet";
import { useAllDepositProviders } from "../../../hooks/deposit/useAllDepositProviders";
import { useBroadcastModal } from "../../../hooks/deposit/useBroadcastModal";
import { usePayoutSignModal } from "../../../hooks/deposit/usePayoutSignModal";
import { useBtcPublicKey } from "../../../hooks/useBtcPublicKey";
import { useVaultDeposits } from "../../../hooks/useVaultDeposits";
import { usePeginStorage } from "../../../storage/usePeginStorage";
import type { VaultActivity } from "../../../types/activity";
import type { Deposit } from "../../../types/vault";

export function useDepositOverviewState() {
  // Wallet connections
  const { connected: btcConnected, address: btcAddress } = useBTCWallet();
  const { connected: ethConnected, address: ethAddress } = useETHWallet();
  const isConnected = btcConnected && ethConnected;

  // Get BTC public key from wallet
  const btcPublicKey = useBtcPublicKey(btcConnected);

  // Fetch deposit data from GraphQL
  const { activities, refetchActivities } = useVaultDeposits(
    ethAddress as `0x${string}` | undefined,
  );

  // Merge with localStorage pending pegins
  const { allActivities, pendingPegins } = usePeginStorage({
    ethAddress: ethAddress || "",
    confirmedPegins: activities,
  });

  // Fetch vault providers for all applications
  const { vaultProviders } = useAllDepositProviders(allActivities);

  // Payout sign modal state
  const {
    signingActivity,
    signingTransactions,
    isOpen: isPayoutSignModalOpen,
    handleSignClick,
    handleClose: handlePayoutSignClose,
    handleSuccess: handlePayoutSignSuccess,
  } = usePayoutSignModal({
    allActivities,
    onSuccess: refetchActivities,
  });

  // Broadcast modal state
  const {
    broadcastingActivity,
    successOpen: broadcastSuccessOpen,
    successAmount: broadcastSuccessAmount,
    handleBroadcastClick,
    handleClose: handleBroadcastClose,
    handleSuccess: handleBroadcastSuccess,
    handleSuccessClose: handleBroadcastSuccessClose,
  } = useBroadcastModal({
    allActivities,
    onSuccess: refetchActivities,
  });

  // Get redeem trigger from context - RedeemModals handles the rest internally
  const { triggerRedeem } = useVaultRedeemState();

  // Transform VaultActivity to Deposit format for table
  const deposits: Deposit[] = useMemo(() => {
    return allActivities.map((activity: VaultActivity) => {
      const appMetadata = activity.applicationController
        ? getApplicationMetadataByController(activity.applicationController)
        : undefined;

      // Find matching pegin in pendingPegins to get batch/split info
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

      // Calculate batch position if part of batch
      let batchIndex: number | undefined;
      let batchTotal: number | undefined;

      if (pendingPegin?.batchId) {
        const batchPegins = pendingPegins
          .filter((p) => p.batchId === pendingPegin.batchId)
          .sort((a, b) => a.timestamp - b.timestamp);

        batchIndex = batchPegins.findIndex((p) => p.id === activity.id) + 1;
        batchTotal = batchPegins.length;
      }

      return {
        id: activity.id,
        amount: parseFloat(activity.collateral.amount),
        pegInTxHash: activity.txHash || activity.id,
        status: activity.displayLabel,
        appName: appMetadata?.name,
        timestamp: activity.timestamp,
        // Multi-vault / split fields - get directly from pegin record
        batchId: pendingPegin?.batchId,
        splitTxId: pendingPegin?.splitTxId, // From pegin record, not batch lookup!
        batchIndex,
        batchTotal,
      };
    });
  }, [allActivities, pendingPegins]);

  return {
    // Connection state
    isConnected,
    ethAddress,
    btcPublicKey,
    btcAddress,

    // Data
    allActivities,
    pendingPegins,
    vaultProviders,
    deposits,

    // Payout sign modal
    signingActivity,
    signingTransactions,
    isPayoutSignModalOpen,
    handleSignClick,
    handlePayoutSignClose,
    handlePayoutSignSuccess,

    // Broadcast modal
    broadcastingActivity,
    broadcastSuccessOpen,
    broadcastSuccessAmount,
    handleBroadcastClick,
    handleBroadcastClose,
    handleBroadcastSuccess,
    handleBroadcastSuccessClose,

    // Redeem - RedeemModals handles the flow internally
    triggerRedeem,
    refetchActivities, // Pass to RedeemModals for onSuccess callback
  };
}
