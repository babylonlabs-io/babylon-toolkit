/**
 * PositionCard Component
 * Displays Collateral and Loans information
 */

import { Card } from "@babylonlabs-io/core-ui";

import type {
  BorrowedAsset,
  HealthFactorStatus,
} from "@/applications/aave/hooks";

import { CollateralSection } from "./CollateralSection";
import { LoansSection } from "./LoansSection";

interface PositionCardProps {
  // Collateral props
  collateralAmount?: string;
  collateralUsdValue?: string;
  hasCollateral?: boolean;
  isPendingWithdraw?: boolean;
  onWithdraw: () => void;
  // Loans props
  hasLoans: boolean;
  borrowedAssets?: BorrowedAsset[];
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  onBorrow: () => void;
  onRepay: () => void;
}

export function PositionCard({
  collateralAmount,
  collateralUsdValue,
  hasCollateral = false,
  isPendingWithdraw = false,
  onWithdraw,
  hasLoans,
  borrowedAssets = [],
  healthFactor,
  healthFactorStatus,
  onBorrow,
  onRepay,
}: PositionCardProps) {
  return (
    <Card className="w-full p-6">
      <div className="space-y-8">
        <CollateralSection
          amount={collateralAmount}
          usdValue={collateralUsdValue}
          hasCollateral={hasCollateral}
          isPendingWithdraw={isPendingWithdraw}
          onWithdraw={onWithdraw}
        />

        <LoansSection
          hasLoans={hasLoans}
          hasCollateral={hasCollateral}
          borrowedAssets={borrowedAssets}
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          onBorrow={onBorrow}
          onRepay={onRepay}
        />
      </div>
    </Card>
  );
}
