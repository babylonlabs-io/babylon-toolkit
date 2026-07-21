/**
 * LoansSummary Component
 * v3 Loans page summary trio: Available to Borrow · Total Borrowed · Health
 * Factor. Reuses the shared PositionStatCards primitive and the borrow-capacity
 * card builder (same cards the Overview position summary uses); the health-factor
 * card is an action-less variant with a color-coded value + heart.
 */

import {
  formatHealthFactor,
  getHealthFactorColor,
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
  availableMeterPercent: number;
  totalBorrowed: string;
  borrowedMeterPercent: number;
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
  availableMeterPercent,
  totalBorrowed,
  borrowedMeterPercent,
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
      availableMeterPercent,
      totalBorrowed,
      borrowedMeterPercent,
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
      tooltip: COPY.loans.healthFactorTooltip,
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
