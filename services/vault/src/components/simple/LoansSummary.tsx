/**
 * LoansSummary Component
 * v3 Loans page summary: Available to Borrow · Borrowed Asset. Reuses the
 * shared PositionStatCards primitive and the borrow-capacity card builder
 * (same cards the Overview position summary uses).
 */

import type { BorrowedAsset } from "@/applications/aave/hooks/useAaveBorrowedAssets";
import type { BorrowReserveLimit } from "@/applications/aave/utils";

import {
  buildBorrowCapacityCards,
  PositionStatCards,
} from "./PositionStatCards";

interface LoansSummaryProps {
  availableToBorrow: string;
  borrowedAssets: BorrowedAsset[];
  maxBorrowReserves: BorrowReserveLimit;
  borrowCount: bigint | null;
  borrowCapacityLoading: boolean;
  borrowCapacityError: Error | null;
  onBorrow: () => void;
  onRepay: () => void;
  canBorrow: boolean;
  canRepay: boolean;
}

export function LoansSummary({
  availableToBorrow,
  borrowedAssets,
  maxBorrowReserves,
  borrowCount,
  borrowCapacityLoading,
  borrowCapacityError,
  onBorrow,
  onRepay,
  canBorrow,
  canRepay,
}: LoansSummaryProps) {
  const cards = buildBorrowCapacityCards({
    availableToBorrow,
    borrowedAssets,
    maxBorrowReserves,
    borrowCount,
    borrowCapacityLoading,
    borrowCapacityError,
    onBorrow,
    onRepay,
    canBorrow,
    canRepay,
    borrowTestId: "loans-borrow-button",
    repayTestId: "loans-repay-button",
  });

  return <PositionStatCards cards={cards} />;
}
