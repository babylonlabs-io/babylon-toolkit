import { useState, useCallback } from 'react';
import { ActivityList } from '@babylonlabs-io/core-ui';
import { PositionCard } from './PositionCard';
import { useVaultPositionsData } from './useVaultPositionsData';
import { useVaultPositions } from '../../hooks/useVaultPositions';
import { RepayFlow } from '../RepayFlow';
import { BorrowFlow } from '../BorrowFlow';
import type { Address } from 'viem';
import type { VaultActivity } from '../../mockData/vaultActivities';

export interface VaultPositionsProps {
  ethAddress?: string;
  btcAddress?: string;
  isWalletConnected?: boolean;
}

export default function VaultPositions({
  ethAddress,
  isWalletConnected = false
}: VaultPositionsProps) {
  // Repay flow state
  const [repayActivity, setRepayActivity] = useState<VaultActivity | null>(null);
  const [repayFlowOpen, setRepayFlowOpen] = useState(false);

  // Borrow flow state
  const [borrowActivity, setBorrowActivity] = useState<VaultActivity | null>(null);
  const [borrowFlowOpen, setBorrowFlowOpen] = useState(false);

  // Use the address from props instead of local wallet state
  const connectedAddress = ethAddress as Address | undefined;

  // Fetch and transform vault positions data
  const { positions, rawPositions, loading, refetch } = useVaultPositionsData(connectedAddress);

  // Fetch available vault deposits (for borrowing against)
  const { activities: availableVaults, refetchActivities } = useVaultPositions();

  // Handle repay button click
  const handleRepay = useCallback((index: number) => {
    const rawPosition = rawPositions[index];
    if (!rawPosition) return;

    // Create VaultActivity from raw position for RepayFlow
    const activity: VaultActivity = {
      id: rawPosition.txHash,
      txHash: rawPosition.txHash,
      collateral: {
        amount: positions[index].collateral.amount,
        symbol: positions[index].collateral.symbol,
        icon: positions[index].collateral.icon,
      },
      status: {
        label: 'Active',
        variant: 'active',
      },
      providers: [],
      morphoPosition: {
        collateral: rawPosition.morphoPosition.collateral,
        borrowShares: rawPosition.morphoPosition.borrowShares,
        borrowed: rawPosition.morphoPosition.borrowShares, // Use borrowShares as borrowed (they're the same conceptually)
        borrowAssets: rawPosition.morphoPosition.borrowAssets,
      },
      borrowingData: {
        borrowedAmount: positions[index].borrowedAmount,
        borrowedSymbol: positions[index].borrowedSymbol,
        currentLTV: positions[index].currentLTV,
        maxLTV: positions[index].liquidationLTV,
      },
      vaultMetadata: {
        depositor: rawPosition.metadata.depositor,
        proxyContract: rawPosition.metadata.proxyContract,
        marketId: rawPosition.metadata.marketId,
        vBTCAmount: rawPosition.metadata.vBTCAmount,
        borrowAmount: rawPosition.metadata.borrowAmount,
        active: rawPosition.metadata.active,
      },
    };

    setRepayActivity(activity);
    setRepayFlowOpen(true);
  }, [rawPositions, positions]);

  // Handle repay flow close
  const handleRepayClose = useCallback(() => {
    setRepayFlowOpen(false);
    setRepayActivity(null);
  }, []);

  // Handle repay success
  const handleRepaySuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Handle create position button click
  // TODO: This will later be replaced with a new design of the UI component
  // where user see list of amount available to borrow. and this list of
  // amount is based on the sum of available collateral in the vault. For
  // example. we have 1 BTC and 2 BTC collateral which are available to borrow.
  // and the user can choose to borrow 1 BTC or 2 BTC or 3 BTC. but they can't
  // borrow 1.5 BTC etc. it had to be a combination of the available collateral.
  //
  // Implementation approach:
  // 1. Open a vault selector modal (fetches available vaults when modal opens)
  // 2. Show vaults grouped by available collateral amounts
  // 3. Allow user to select single vault OR combination of vaults
  // 4. Pass selected vault(s) to BorrowFlow
  const handleCreatePosition = useCallback(() => {
    // Filter for vaults that are available to borrow against
    // A vault is available if:
    // 1. PeginRequest status is "active" (variant === 'active')
    // 2. Either:
    //    - No vaultMetadata (not yet minted)
    //    - OR vaultMetadata.active === false (minted but nothing borrowed yet)
    const availableForBorrow = availableVaults.filter(
      vault => vault.status.variant === 'active' && (!vault.vaultMetadata || vault.vaultMetadata.active === false)
    );

    // For now, use the first available vault
    // Later: show vault selector to let user choose
    if (availableForBorrow.length > 0) {
      setBorrowActivity(availableForBorrow[0]);
      setBorrowFlowOpen(true);
    } else {
      // Show message when no vaults are available
      alert('No available vaults to borrow against. Please deposit BTC first to create a vault.');
    }
  }, [availableVaults]);

  // Handle borrow flow close
  const handleBorrowClose = useCallback(() => {
    setBorrowFlowOpen(false);
    setBorrowActivity(null);
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
        >
          {positions.map((position, index) => (
            <PositionCard
              key={rawPositions[index]?.txHash || index}
              position={position}
              onRepay={() => handleRepay(index)}
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
        activity={borrowActivity}
        isOpen={borrowFlowOpen}
        onClose={handleBorrowClose}
        onBorrowSuccess={handleBorrowSuccess}
      />
    </>
  );
}
