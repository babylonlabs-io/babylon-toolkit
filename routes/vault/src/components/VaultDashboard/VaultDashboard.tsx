import { ActivityList } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
import { BorrowFlow } from "../BorrowFlow";
import { RepayFlow } from "../RepayFlow";
import {
  PeginModal,
  PeginSignModal,
  PeginSuccessModal,
} from "../modals";
import { useVaultPositions } from "../../hooks/useVaultPositions";
import { useBorrowFlow } from "../../hooks/useBorrowFlow";
import { useRepayFlow } from "../../hooks/useRepayFlow";
import { usePeginFlow } from "../../hooks/usePeginFlow";
import { EmptyState } from "./EmptyState";
import { VaultActivityCard } from "./VaultActivityCard";
import type { VaultActivity } from "../../mockData/vaultActivities";

export function VaultDashboard() {
  // Data fetching
  const {
    activities,
    isWalletConnected,
    refetchActivities,
    connectedAddress,
    btcAddress,
    addPendingPegin,
  } = useVaultPositions();

  // Borrow flow modal state
  const {
    isOpen: borrowFlowOpen,
    selectedActivity: selectedBorrowActivity,
    openBorrowFlow,
    closeBorrowFlow,
  } = useBorrowFlow();

  // Repay flow modal state
  const {
    isOpen: repayFlowOpen,
    selectedActivity: selectedRepayActivity,
    openRepayFlow,
    closeRepayFlow,
  } = useRepayFlow();

  // Peg-in flow modal state
  const {
    isOpen: peginFlowOpen,
    signModalOpen: peginSignModalOpen,
    successModalOpen: peginSuccessModalOpen,
    peginAmount,
    selectedProviders,
    btcBalanceSat,
    openPeginFlow,
    closePeginFlow,
    handlePeginClick,
    handlePeginSignSuccess: handlePeginSignSuccessBase,
    handlePeginSuccessClose,
  } = usePeginFlow();

  // Handle peg-in sign success with storage integration
  const handlePeginSignSuccess = useCallback(() => {
    // Add to local storage when peg-in is submitted
    if (connectedAddress && btcAddress) {
      const peginId = `pending-${Date.now()}`; // Temporary ID until we get BTC tx hash
      
      addPendingPegin({
        id: peginId,
        amount: peginAmount.toString(),
        providers: selectedProviders,
        ethAddress: connectedAddress,
        btcAddress: btcAddress,
      });

      console.log('[VaultDashboard] Added pending peg-in to localStorage:', {
        id: peginId,
        amount: peginAmount,
        providers: selectedProviders,
      });
    }

    // Complete the peg-in flow and refetch activities
    handlePeginSignSuccessBase(() => {
      refetchActivities();
    });
  }, [connectedAddress, btcAddress, peginAmount, selectedProviders, addPendingPegin, handlePeginSignSuccessBase, refetchActivities]);

  // Show message if wallet is not connected
  if (!isWalletConnected) {
    return <EmptyState />;
  }

  return (
    <>
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col px-4 py-8">
        <ActivityList
          onNewItem={openPeginFlow}
          isEmpty={activities.length === 0}
          isConnected={isWalletConnected}
        >
          {activities.map((activity: VaultActivity) => (
            <VaultActivityCard
              key={activity.id}
              activity={activity}
              onBorrow={openBorrowFlow}
              onRepay={openRepayFlow}
            />
          ))}
        </ActivityList>
      </div>

      {/* Peg-in Modals */}
      <PeginModal
        open={peginFlowOpen}
        onClose={closePeginFlow}
        onPegIn={handlePeginClick}
        btcBalance={btcBalanceSat}
      />

      <PeginSignModal
        open={peginSignModalOpen}
        onClose={() => {}}
        onSuccess={handlePeginSignSuccess}
        amount={peginAmount}
        selectedProviders={selectedProviders}
      />

      <PeginSuccessModal
        open={peginSuccessModalOpen}
        onClose={handlePeginSuccessClose}
        amount={peginAmount}
      />

      <BorrowFlow
        activity={selectedBorrowActivity}
        isOpen={borrowFlowOpen}
        onClose={closeBorrowFlow}
        onBorrowSuccess={refetchActivities}
      />

      <RepayFlow
        activity={selectedRepayActivity}
        isOpen={repayFlowOpen}
        onClose={closeRepayFlow}
        onRepaySuccess={refetchActivities}
      />
    </>
  );
}

