/**
 * LoanCard - Main orchestrator component
 * Manages tabs for Borrow and Repay flows
 */

import { Card, Tabs } from "@babylonlabs-io/core-ui";

import { Borrow } from "./Borrow";
import { Repay } from "./Repay";

export interface LoanCardProps {
  defaultTab?: string;

  // Borrow flow props
  maxCollateral: number;
  maxBorrow: number;
  btcPrice: number;
  liquidationLtv: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;

  // Repay flow props
  currentLoanAmount: number;
  currentCollateralAmount: number;
  onRepay?: (repayAmount: number, withdrawCollateralAmount: number) => void;
}

export function LoanCard({
  defaultTab = "borrow",
  maxCollateral,
  maxBorrow,
  btcPrice,
  liquidationLtv,
  onBorrow,
  currentLoanAmount,
  currentCollateralAmount,
  onRepay,
}: LoanCardProps) {
  // Only show Repay tab if user has an existing position (currentLoanAmount > 0)
  const hasPosition = currentLoanAmount > 0;

  return (
    <Card>
      <Tabs
        items={[
          {
            id: "borrow",
            label: "Borrow",
            content: (
              <Borrow
                maxCollateral={maxCollateral}
                maxBorrow={maxBorrow}
                btcPrice={btcPrice}
                liquidationLtv={liquidationLtv}
                onBorrow={onBorrow}
              />
            ),
          },
          ...(hasPosition
            ? [
                {
                  id: "repay",
                  label: "Repay",
                  content: (
                    <Repay
                      currentLoanAmount={currentLoanAmount}
                      currentCollateralAmount={currentCollateralAmount}
                      btcPrice={btcPrice}
                      liquidationLtv={liquidationLtv}
                      onRepay={onRepay!}
                    />
                  ),
                },
              ]
            : []),
        ]}
        defaultActiveTab={defaultTab}
      />
    </Card>
  );
}
