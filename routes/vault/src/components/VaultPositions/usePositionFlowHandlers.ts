/**
 * Hook to manage position flow handlers
 *
 * Extracts common logic for handling position actions (repay, borrow more, etc.)
 * to reduce duplication in VaultPositions component.
 */

import { useState, useCallback } from 'react';
import type { VaultActivity } from '../../types';
import type { PositionData } from './PositionCard';

interface RawPosition {
  positionId: string;
  position: {
    marketId: string;
  };
  morphoPosition: {
    collateral: bigint;
    borrowShares: bigint;
    borrowAssets: bigint;
  };
}

interface UsePositionFlowHandlersParams {
  rawPositions: RawPosition[];
  positions: PositionData[];
  refetch: () => Promise<void>;
}

interface UsePositionFlowHandlersResult {
  // Repay flow
  repayActivity: VaultActivity | null;
  repayFlowOpen: boolean;
  handleRepay: (index: number) => void;
  handleRepayClose: () => void;
  handleRepaySuccess: () => Promise<void>;

  // Borrow more flow
  borrowMoreActivity: VaultActivity | null;
  borrowMoreFlowOpen: boolean;
  handleBorrowMore: (index: number) => void;
  handleBorrowMoreClose: () => void;
  handleBorrowMoreSuccess: () => Promise<void>;
}

/**
 * Helper to create VaultActivity from position index
 */
function createActivityFromPosition(
  index: number,
  rawPositions: RawPosition[],
  positions: PositionData[]
): VaultActivity | null {
  const rawPosition = rawPositions[index];
  if (!rawPosition) return null;

  return {
    id: rawPosition.positionId,
    collateral: {
      amount: positions[index].collateral.amount,
      symbol: positions[index].collateral.symbol,
      icon: positions[index].collateral.icon,
    },
    providers: [],
    morphoPosition: {
      collateral: rawPosition.morphoPosition.collateral,
      borrowShares: rawPosition.morphoPosition.borrowShares,
      borrowed: rawPosition.morphoPosition.borrowShares,
      borrowAssets: rawPosition.morphoPosition.borrowAssets,
    },
    borrowingData: {
      borrowedAmount: positions[index].borrowedAmount,
      borrowedSymbol: positions[index].borrowedSymbol,
      currentLTV: positions[index].currentLTV,
      maxLTV: positions[index].liquidationLTV,
    },
    marketId: rawPosition.position.marketId,
  };
}

export function usePositionFlowHandlers({
  rawPositions,
  positions,
  refetch,
}: UsePositionFlowHandlersParams): UsePositionFlowHandlersResult {
  // Repay flow state
  const [repayActivity, setRepayActivity] = useState<VaultActivity | null>(null);
  const [repayFlowOpen, setRepayFlowOpen] = useState(false);

  // Borrow more flow state
  const [borrowMoreActivity, setBorrowMoreActivity] = useState<VaultActivity | null>(null);
  const [borrowMoreFlowOpen, setBorrowMoreFlowOpen] = useState(false);

  // Repay handlers
  const handleRepay = useCallback((index: number) => {
    const activity = createActivityFromPosition(index, rawPositions, positions);
    if (!activity) return;

    setRepayActivity(activity);
    setRepayFlowOpen(true);
  }, [rawPositions, positions]);

  const handleRepayClose = useCallback(() => {
    setRepayFlowOpen(false);
    setRepayActivity(null);
  }, []);

  const handleRepaySuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Borrow more handlers
  const handleBorrowMore = useCallback((index: number) => {
    const activity = createActivityFromPosition(index, rawPositions, positions);
    if (!activity) return;

    setBorrowMoreActivity(activity);
    setBorrowMoreFlowOpen(true);
  }, [rawPositions, positions]);

  const handleBorrowMoreClose = useCallback(() => {
    setBorrowMoreFlowOpen(false);
    setBorrowMoreActivity(null);
  }, []);

  const handleBorrowMoreSuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    // Repay flow
    repayActivity,
    repayFlowOpen,
    handleRepay,
    handleRepayClose,
    handleRepaySuccess,

    // Borrow more flow
    borrowMoreActivity,
    borrowMoreFlowOpen,
    handleBorrowMore,
    handleBorrowMoreClose,
    handleBorrowMoreSuccess,
  };
}
