import { ActivityList } from '@babylonlabs-io/core-ui';
import { useCallback, useState } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import { PeginModal } from '../PeginFlow/PeginModal/PeginModal';
import { PeginSignModal } from '../PeginFlow/PeginSignModal/PeginSignModal';
import { PeginSuccessModal } from '../PeginFlow/PeginSuccessModal/PeginSuccessModal';
import { RepayFlow } from '../RepayFlow';
import { useVaultPositions } from '../../hooks/useVaultPositions';
import { usePeginFlow } from './usePeginFlow';
import { EmptyState } from './EmptyState';
import { VaultActivityCard } from './VaultActivityCard';
import type { VaultActivity } from '../../mockData/vaultActivities';

export interface VaultDepositProps {
  ethAddress?: string;
  btcAddress?: string;
  isWalletConnected?: boolean;
}

export function VaultDeposit({
  ethAddress,
  btcAddress: btcAddressProp,
  isWalletConnected: isWalletConnectedProp = false,
}: VaultDepositProps) {
  // Peg out flow state
  const [pegoutActivity, setPegoutActivity] = useState<VaultActivity | null>(
    null,
  );
  const [pegoutFlowOpen, setPegoutFlowOpen] = useState(false);

  // Handle peg out button click
  const handlePegOut = useCallback((activity: VaultActivity) => {
    setPegoutActivity(activity);
    setPegoutFlowOpen(true);
  }, []);

  // Handle peg out flow close
  const handlePegoutClose = useCallback(() => {
    setPegoutFlowOpen(false);
    setPegoutActivity(null);
  }, []);

  // Data fetching with peg out handler
  const {
    activities,
    pendingPegins,
    isWalletConnected: _isWalletConnected,
    refetchActivities,
    connectedAddress: _connectedAddress,
    btcAddress,
    addPendingPegin,
    updatePendingPeginStatus,
  } = useVaultPositions(handlePegOut);

  // Use props with fallback to hook values
  const connectedAddress = ethAddress || _connectedAddress;
  const effectiveBtcAddress = btcAddressProp || btcAddress;
  const isWalletConnected = isWalletConnectedProp;

  // Peg-in flow modal state
  // Note: Borrow/Repay flows are now in VaultPositions tab
  const {
    isOpen: peginFlowOpen,
    signModalOpen: peginSignModalOpen,
    successModalOpen: peginSuccessModalOpen,
    peginAmount,
    selectedProviders,
    btcBalanceSat,
    openPeginFlow,
    closePeginFlow,
    closeSignModal,
    handlePeginClick,
    handlePeginSignSuccess: handlePeginSignSuccessBase,
    handlePeginSuccessClose,
  } = usePeginFlow();

  // Get BTC wallet connector
  const btcConnector = useChainConnector('BTC');

  // Handle peg-in sign success with storage integration
  const handlePeginSignSuccess = useCallback(
    (data: {
      btcTxId: string;
      ethTxHash: string;
      unsignedTxHex: string;
      utxo: {
        txid: string;
        vout: number;
        value: bigint;
        scriptPubKey: string;
      };
    }) => {
      // Add to local storage with BTC transaction ID as ID (with 0x prefix)
      // IMPORTANT: The smart contract stores BTC txids as Hex type (with 0x prefix)
      // and uses them as keys in the btcVaults mapping. We normalize to match this format
      // for proper deduplication when confirmed pegins are fetched from the contract.
      if (connectedAddress && effectiveBtcAddress) {
        const idForStorage = data.btcTxId.startsWith('0x')
          ? data.btcTxId
          : `0x${data.btcTxId}`;

        const peginData = {
          id: idForStorage,
          amount: peginAmount.toString(),
          providers: selectedProviders,
          ethAddress: connectedAddress,
          btcAddress: effectiveBtcAddress,
          unsignedTxHex: data.unsignedTxHex,
          utxo: {
            txid: data.utxo.txid,
            vout: data.utxo.vout,
            value: data.utxo.value.toString(),
            scriptPubKey: data.utxo.scriptPubKey,
          },
        };
        addPendingPegin(peginData);
      }

      // Close sign modal and refetch (NO success modal shown yet)
      // Success modal will be shown after BTC broadcast (from BroadcastBtcButton)
      closePeginFlow();
      refetchActivities();
    },
    [
      connectedAddress,
      effectiveBtcAddress,
      peginAmount,
      selectedProviders,
      addPendingPegin,
      closePeginFlow,
      refetchActivities,
    ],
  );

  // Handle showing success modal from BroadcastBtcButton
  const handleShowSuccessModal = useCallback(() => {
    handlePeginSignSuccessBase(() => {});
  }, [handlePeginSignSuccessBase]);

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
              connectedAddress={connectedAddress}
              pendingPegins={pendingPegins}
              updatePendingPeginStatus={updatePendingPeginStatus}
              onRefetchActivities={refetchActivities}
              onShowSuccessModal={handleShowSuccessModal}
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
        onClose={closeSignModal}
        onSuccess={handlePeginSignSuccess}
        amount={peginAmount}
        selectedProviders={selectedProviders}
        btcConnector={btcConnector}
        btcAddress={btcAddress || ''}
        depositorEthAddress={(connectedAddress || '0x0') as `0x${string}`}
      />

      {/* Success modal now shown by BroadcastBtcButton after BTC broadcast */}
      <PeginSuccessModal
        open={peginSuccessModalOpen}
        onClose={handlePeginSuccessClose}
        amount={peginAmount}
      />

      {/* Peg Out Flow (uses RepayFlow which calls repayAndPegout) */}
      {/* Note: Currently uses repayAndPegout which repays Morpho and pegs out atomically. */}
      {/* Future: Will be split into separate repay and pegout transactions. */}
      <RepayFlow
        activity={pegoutActivity}
        isOpen={pegoutFlowOpen}
        onClose={handlePegoutClose}
        onRepaySuccess={refetchActivities}
      />
    </>
  );
}
