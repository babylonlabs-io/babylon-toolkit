/**
 * LoanCard - Main orchestrator component for Aave borrow/repay UI
 */

import { Card, Tabs } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { useLoanContext } from "../context/LoanContext";

import { Borrow } from "./Borrow";
import { Repay } from "./Repay";
import type { Asset } from "./types";

const LOAN_TAB = {
  BORROW: "borrow",
  REPAY: "repay",
} as const;

type LoanTab = (typeof LOAN_TAB)[keyof typeof LOAN_TAB];

export interface LoanCardProps {
  defaultTab?: LoanTab;
  /** The selected asset to borrow (from route) */
  selectedAsset: Asset;
  /** vBTC liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  onBorrow: (collateralAmount: number, borrowAmount: number) => void;
  onViewLoan: () => void;
  onRepay?: (repayAmount: number, withdrawCollateralAmount: number) => void;
  processing?: boolean;
}

export function LoanCard({
  defaultTab = LOAN_TAB.BORROW,
  selectedAsset,
  liquidationThresholdBps,
  onBorrow,
  onViewLoan,
  onRepay,
  processing = false,
}: LoanCardProps) {
  const { collateralValueUsd, currentDebtUsd, healthFactor } = useLoanContext();

  const hasPosition = currentDebtUsd > 0 || collateralValueUsd > 0;

  const [activeTab, setActiveTab] = useState<LoanTab>(defaultTab);

  useEffect(() => {
    if (activeTab === LOAN_TAB.REPAY && !hasPosition) {
      setActiveTab(LOAN_TAB.BORROW);
    }
  }, [hasPosition, activeTab]);

  return (
    <Card>
      <Tabs
        items={[
          {
            id: LOAN_TAB.BORROW,
            label: "Borrow",
            content: (
              <Borrow
                collateralValueUsd={collateralValueUsd}
                currentDebtUsd={currentDebtUsd}
                liquidationThresholdBps={liquidationThresholdBps}
                currentHealthFactor={healthFactor}
                selectedAsset={selectedAsset}
                onBorrow={onBorrow}
                onViewLoan={onViewLoan}
                processing={processing}
              />
            ),
          },
          {
            id: LOAN_TAB.REPAY,
            label: "Repay",
            content: (
              <Repay
                collateralValueUsd={collateralValueUsd}
                currentDebtUsd={currentDebtUsd}
                liquidationThresholdBps={liquidationThresholdBps}
                currentHealthFactor={healthFactor}
                selectedAsset={selectedAsset}
                onRepay={onRepay ?? (() => {})}
                onViewLoan={onViewLoan}
                processing={processing}
              />
            ),
          },
        ]}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as LoanTab)}
      />
    </Card>
  );
}
