/**
 * useDepositOverviewState Hook
 *
 * Manages all state and data fetching for the DepositOverview component.
 * Extracts business logic from the UI component for better separation of concerns.
 */

import { useMemo } from "react";

import { getApplicationMetadataByController } from "../../../applications";
import { useBTCWallet, useETHWallet } from "../../../context/wallet";
import { useAllDepositProviders } from "../../../hooks/deposit/useAllDepositProviders";
import { useBroadcastModal } from "../../../hooks/deposit/useBroadcastModal";
import { usePayoutSignModal } from "../../../hooks/deposit/usePayoutSignModal";
import { useRedeemModal } from "../../../hooks/deposit/useRedeemModal";
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

  // Redeem modal state
  const {
    redeemStep,
    redeemDepositIds,
    handleRedeemClick,
    handleFormNext: handleRedeemFormNext,
    handleReviewConfirm: handleRedeemReviewConfirm,
    handleSignSuccess: handleRedeemSignSuccess,
    handleClose: handleRedeemClose,
  } = useRedeemModal({
    onSuccess: refetchActivities,
  });

  // Transform VaultActivity to Deposit format for table
  const deposits: Deposit[] = useMemo(() => {
    return allActivities.map((activity: VaultActivity) => {
      const appMetadata = activity.applicationController
        ? getApplicationMetadataByController(activity.applicationController)
        : undefined;
      return {
        id: activity.id,
        amount: parseFloat(activity.collateral.amount),
        pegInTxHash: activity.txHash || activity.id,
        status: activity.displayLabel,
        appName: appMetadata?.name,
        timestamp: activity.timestamp,
      };
    });
  }, [allActivities]);

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

    // Redeem modal
    redeemStep,
    redeemDepositIds,
    handleRedeemClick,
    handleRedeemFormNext,
    handleRedeemReviewConfirm,
    handleRedeemSignSuccess,
    handleRedeemClose,
  };
}
