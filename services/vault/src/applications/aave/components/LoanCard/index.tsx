/**
 * LoanCard - Tab container for Aave borrow/repay UI
 *
 * Child components (Borrow, Repay) get their data from LoanContext
 * and handle their own transaction logic.
 */

import { Card, Tabs } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useLoanContext } from "../context/LoanContext";

import { Borrow } from "./Borrow";
import { Repay } from "./Repay";

export interface LoanCardProps {
  defaultTab?: LoanTab;
}

export function LoanCard({ defaultTab = LOAN_TAB.BORROW }: LoanCardProps) {
  const { collateralValueUsd, currentDebtUsd } = useLoanContext();

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
            content: <Borrow />,
          },
          {
            id: LOAN_TAB.REPAY,
            label: "Repay",
            content: <Repay />,
          },
        ]}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as LoanTab)}
      />
    </Card>
  );
}
