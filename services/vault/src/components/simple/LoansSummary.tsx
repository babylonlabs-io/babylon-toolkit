/**
 * LoansSummary Component
 * v3 Loans page summary trio: Available to Borrow · Borrowed Asset · Health
 * Factor. Reuses the shared PositionStatCards primitive and the borrow-capacity
 * card builder (same cards the Overview position summary uses); the health-factor
 * card is an action-less variant with a color-coded value + heart.
 */

import type { BorrowedAsset } from "@/applications/aave/hooks/useAaveBorrowedAssets";
import {
  formatHealthFactor,
  getHealthFactorColor,
  type BorrowReserveLimit,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

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
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
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
  healthFactor,
  healthFactorStatus,
  onBorrow,
  onRepay,
  canBorrow,
  canRepay,
}: LoansSummaryProps) {
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);
  const healthFactorText =
    healthFactor !== null
      ? formatHealthFactor(healthFactor)
      : COPY.common.emptyValue;

  const cards = [
    ...buildBorrowCapacityCards({
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
    }),
    {
      label: COPY.loans.healthFactorLabel,
      tooltip: COPY.tooltips.healthFactor,
      value: healthFactorText,
      valueNode: (
        <>
          <span style={{ color: healthFactorColor }}>{healthFactorText}</span>
          {healthFactor !== null && (
            <HeartIcon color={healthFactorColor} className="size-6" />
          )}
        </>
      ),
      caption: COPY.loans.healthFactorCaption,
    },
  ];

  return <PositionStatCards cards={cards} />;
}
