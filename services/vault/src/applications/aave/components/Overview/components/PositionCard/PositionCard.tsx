/**
 * PositionCard Component
 * Displays Collateral and Loans information under tabbed sections
 */

import { Card, Tabs } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import type { BorrowedAsset } from "@/applications/aave/hooks";

import { CollateralSection } from "./CollateralSection";
import { LoansSection } from "./LoansSection";

interface PositionCardProps {
  // Collateral props
  collateralAmount?: string;
  collateralUsdValue?: string;
  hasCollateral?: boolean;
  isConnected?: boolean;
  onAdd: () => void;
  onWithdraw: () => void;
  // Loans props
  hasLoans: boolean;
  borrowedAssets?: BorrowedAsset[];
  healthFactor: number | null;
  onBorrow: () => void;
  onRepay: () => void;
}

export function PositionCard({
  collateralAmount,
  collateralUsdValue,
  hasCollateral = false,
  isConnected = false,
  onAdd,
  onWithdraw,
  hasLoans,
  borrowedAssets = [],
  healthFactor,
  onBorrow,
  onRepay,
}: PositionCardProps) {
  const [activeTab, setActiveTab] = useState("babylon-prime");

  return (
    <Card className="w-full">
      <Tabs
        items={[
          {
            id: "babylon-prime",
            label: "Babylon Prime",
            content: (
              <div className="space-y-8 pt-4">
                {/* Collateral Section */}
                <CollateralSection
                  amount={collateralAmount}
                  usdValue={collateralUsdValue}
                  hasCollateral={hasCollateral}
                  isConnected={isConnected}
                  onAdd={onAdd}
                  onWithdraw={onWithdraw}
                />

                {/* Loans Section */}
                <LoansSection
                  hasLoans={hasLoans}
                  hasCollateral={hasCollateral}
                  borrowedAssets={borrowedAssets}
                  healthFactor={healthFactor}
                  onBorrow={onBorrow}
                  onRepay={onRepay}
                />
              </div>
            ),
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </Card>
  );
}
