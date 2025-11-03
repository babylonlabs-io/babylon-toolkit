/**
 * LoanCard - Main orchestrator component
 * Manages tabs for Borrow and Repay flows
 */

import { Card, Tabs } from "@babylonlabs-io/core-ui";

import { useMarketDetailContext } from "../../context/MarketDetailContext";

import { Borrow } from "./Borrow";
import { Repay } from "./Repay";

export interface LoanCardProps {
  defaultTab?: string;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  onRepay?: (repayAmount: number, withdrawCollateralAmount: number) => void;
}

export function LoanCard({
  defaultTab = "borrow",
  onBorrow,
  onRepay,
}: LoanCardProps) {
  const {
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    availableVaults,
    availableLiquidity,
  } = useMarketDetailContext();

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
                btcPrice={btcPrice}
                liquidationLtv={liquidationLtv}
                onBorrow={onBorrow}
                availableVaults={availableVaults}
                availableLiquidity={availableLiquidity}
                currentCollateralAmount={currentCollateralAmount}
                currentLoanAmount={currentLoanAmount}
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
