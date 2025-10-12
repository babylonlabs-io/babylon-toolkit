import { ActivityList } from '@babylonlabs-io/core-ui';
import { useCallback } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import { BorrowFlow } from '../BorrowFlow';
import { RepayFlow } from '../RepayFlow';
import { PeginModal } from '../PeginFlow/PeginModal/PeginModal';
import { PeginSignModal } from '../PeginFlow/PeginSignModal/PeginSignModal';
import { PeginSuccessModal } from '../PeginFlow/PeginSuccessModal/PeginSuccessModal';
import { useVaultPositions } from '../../hooks/useVaultPositions';
import { useBorrowFlow } from './useBorrowFlow';
import { useRepayFlow } from './useRepayFlow';
import { usePeginFlow } from './usePeginFlow';
import { EmptyState } from './EmptyState';
import { VaultActivityCard } from './VaultActivityCard';
import type { VaultActivity } from '../../mockData/vaultActivities';

export function VaultDeposit() {
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

  // Get BTC wallet connector
  const btcConnector = useChainConnector('BTC');

  // Handle peg-in sign success with storage integration
  const handlePeginSignSuccess = useCallback(
    (btcTxId: string) => {
      // Add to local storage with BTC transaction ID as ID (with 0x prefix)
      // IMPORTANT: The smart contract stores BTC txids as Hex type (with 0x prefix)
      // and uses them as keys in the btcVaults mapping. We normalize to match this format
      // for proper deduplication when confirmed pegins are fetched from the contract.
      if (connectedAddress && btcAddress) {
        const idForStorage = btcTxId.startsWith('0x')
          ? btcTxId
          : `0x${btcTxId}`;

        const peginData = {
          id: idForStorage,
          amount: peginAmount.toString(),
          providers: selectedProviders,
          ethAddress: connectedAddress,
          btcAddress: btcAddress,
        };
        addPendingPegin(peginData);
      }

      // Complete the peg-in flow and show success modal
      handlePeginSignSuccessBase(() => {
        refetchActivities();
      });
    },
    [
      connectedAddress,
      btcAddress,
      peginAmount,
      selectedProviders,
      addPendingPegin,
      handlePeginSignSuccessBase,
      refetchActivities,
    ],
  );

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
        btcConnector={btcConnector}
        btcAddress={btcAddress || ''}
        depositorEthAddress={connectedAddress || '0x0'}
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
