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
  processing?: boolean;
}

export function LoanCard({
  defaultTab = "borrow",
  onBorrow,
  onRepay,
  processing = false,
}: LoanCardProps) {
  const {
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    availableVaults,
    availableLiquidity,
  } = useMarketDetailContext();

  // Show Repay tab if user has a position (has loan OR has collateral)
  // User might have repaid all debt but still have collateral to withdraw
  const hasPosition = currentLoanAmount > 0 || currentCollateralAmount > 0;

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
                processing={processing}
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
                      processing={processing}
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
