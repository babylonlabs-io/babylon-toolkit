/**
 * LoanCard - Main orchestrator component for Aave UI duplicate
 */

import { Card, Tabs } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { useMarketDetailContext } from "../context/MarketDetailContext";

import { Borrow } from "./Borrow";

export interface LoanCardProps {
  defaultTab?: string;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  onViewLoan: () => void;
  onRepay?: (repayAmount: number, withdrawCollateralAmount: number) => void;
  processing?: boolean;
}

export function LoanCard({
  defaultTab = "borrow",
  onBorrow,
  onViewLoan,
  // onRepay,
  processing = false,
}: LoanCardProps) {
  const {
    btcPrice,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    availableLiquidity,
  } = useMarketDetailContext();

  const hasPosition = currentLoanAmount > 0 || currentCollateralAmount > 0;

  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (activeTab === "repay" && !hasPosition) {
      setActiveTab("borrow");
    }
  }, [hasPosition, activeTab]);

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
                onViewLoan={onViewLoan}
                availableLiquidity={availableLiquidity}
                currentCollateralAmount={currentCollateralAmount}
                currentLoanAmount={currentLoanAmount}
                processing={processing}
              />
            ),
          },
          // TODO: Add repay tab
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </Card>
  );
}
