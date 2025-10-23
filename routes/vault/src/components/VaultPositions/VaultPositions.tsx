import { useState, useCallback } from 'react';
import { ActivityList } from '@babylonlabs-io/core-ui';
import { PositionCard } from './PositionCard';
import { useVaultPositionsData } from './useVaultPositionsData';
import { useVaultPositions } from '../../hooks/useVaultPositions';
import { usePositionFlowHandlers } from './usePositionFlowHandlers';
import { RepayFlow } from '../RepayFlow';
import { BorrowFlow } from '../BorrowFlow';
import { BorrowMoreFlow } from '../BorrowMoreFlow';
import { WithdrawFlow } from '../WithdrawFlow';
import type { Address } from 'viem';

export interface VaultPositionsProps {
  ethAddress?: string;
  btcAddress?: string;
  isWalletConnected?: boolean;
}

export default function VaultPositions({
  ethAddress,
  isWalletConnected = false
}: VaultPositionsProps) {
  // Borrow flow state
  const [borrowFlowOpen, setBorrowFlowOpen] = useState(false);

  // Use the address from props instead of local wallet state
  const connectedAddress = ethAddress as Address | undefined;

  // Fetch and transform vault positions data
  const { positions, rawPositions, loading, refetch } = useVaultPositionsData(connectedAddress);

  // Fetch available vault deposits (for borrowing against)
  const { refetchActivities } = useVaultPositions(connectedAddress);

  // Position flow handlers (repay, borrow more, withdraw)
  const {
    repayActivity,
    repayFlowOpen,
    handleRepay,
    handleRepayClose,
    handleRepaySuccess,
    borrowMoreActivity,
    borrowMoreFlowOpen,
    handleBorrowMore,
    handleBorrowMoreClose,
    handleBorrowMoreSuccess,
    withdrawActivity,
    withdrawFlowOpen,
    handleWithdraw,
    handleWithdrawClose,
    handleWithdrawSuccess,
  } = usePositionFlowHandlers({ rawPositions, positions, refetch });

  // Handle create position button click
  // Implementation approach:
  // 1. Open a vault selector modal (fetches available vaults when modal opens)
  // 2. Show vaults grouped by available collateral amounts
  // 3. Allow user to select single vault OR combination of vaults
  // 4. Pass selected vault(s) to BorrowFlow
  const handleCreatePosition = useCallback(() => {
    // Simply open the borrow flow - it will fetch available collaterals internally
    setBorrowFlowOpen(true);
  }, []);

  // Handle borrow flow close
  const handleBorrowClose = useCallback(() => {
    setBorrowFlowOpen(false);
  }, []);

  // Handle borrow success
  const handleBorrowSuccess = useCallback(async () => {
    await refetch();
    await refetchActivities();
  }, [refetch, refetchActivities]);

  // Show message if wallet is not connected
  // Use the isWalletConnected prop to check both BTC and ETH wallets
  if (!isWalletConnected) {
    return (
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-semibold">Connect Your Wallet</h2>
          <p className="text-gray-600">
            Please connect your wallet to view your positions
          </p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="text-center">
          <p className="text-gray-600">Loading positions...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col px-4 py-8">
        <ActivityList
          onNewItem={handleCreatePosition}
          isEmpty={positions.length === 0}
          isConnected={!!connectedAddress}
          emptyStateTitle="Create Your First Borrowing Position"
          emptyStateDescription="Use your available BTC collateral to create a borrowing position. Select from your verified deposits to borrow against them."
        >
          {positions.map((position, index) => (
            <PositionCard
              key={rawPositions[index]?.positionId || index}
              position={position}
              onRepay={() => handleRepay(index)}
              onBorrowMore={() => handleBorrowMore(index)}
              onWithdraw={() => handleWithdraw(index)}
            />
          ))}
        </ActivityList>
      </div>

      {/* Repay Flow */}
      <RepayFlow
        activity={repayActivity}
        isOpen={repayFlowOpen}
        onClose={handleRepayClose}
        onRepaySuccess={handleRepaySuccess}
      />

      {/* Borrow Flow */}
      <BorrowFlow
        isOpen={borrowFlowOpen}
        onClose={handleBorrowClose}
        onBorrowSuccess={handleBorrowSuccess}
        connectedAddress={connectedAddress}
      />

      {/* Borrow More Flow */}
      <BorrowMoreFlow
        activity={borrowMoreActivity}
        isOpen={borrowMoreFlowOpen}
        onClose={handleBorrowMoreClose}
        onBorrowMoreSuccess={handleBorrowMoreSuccess}
      />

      {/* Withdraw Flow */}
      <WithdrawFlow
        activity={withdrawActivity}
        isOpen={withdrawFlowOpen}
        onClose={handleWithdrawClose}
        onWithdrawSuccess={handleWithdrawSuccess}
      />
    </>
  );
}
