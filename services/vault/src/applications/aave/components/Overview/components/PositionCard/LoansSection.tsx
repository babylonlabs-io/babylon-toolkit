/**
 * LoansSection Component
 * Displays loan information with Borrow/Repay buttons
 */

import { Avatar, Button, SubSection } from "@babylonlabs-io/core-ui";

import type { BorrowedAsset } from "@/applications/aave/hooks";
import {
  formatHealthFactor,
  isHealthFactorHealthy,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";

export interface LoansSectionProps {
  hasLoans: boolean;
  hasCollateral: boolean;
  borrowedAssets?: BorrowedAsset[];
  healthFactor: number | null;
  onBorrow: () => void;
  onRepay: () => void;
}

export function LoansSection({
  hasLoans,
  hasCollateral,
  borrowedAssets = [],
  healthFactor,
  onBorrow,
  onRepay,
}: LoansSectionProps) {
  const isHealthy = isHealthFactorHealthy(healthFactor);
  const healthFactorFormatted = formatHealthFactor(healthFactor);

  return (
    <div className="w-full space-y-6">
      {/* Header with buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">Loans</h2>
        {hasLoans ? (
          <div className="flex gap-3">
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onBorrow}
              className="rounded-full"
              disabled={!hasCollateral}
            >
              Borrow
            </Button>
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onRepay}
              className="rounded-full"
            >
              Repay
            </Button>
          </div>
        ) : (
          <Button
            variant="outlined"
            color="primary"
            size="medium"
            onClick={onBorrow}
            className="rounded-full"
            disabled={!hasCollateral}
          >
            Borrow
          </Button>
        )}
      </div>

      {/* Content - either loan info or empty state */}
      {hasLoans ? (
        <SubSection className="w-full">
          <div className="space-y-4">
            {/* Borrowed Rows - one per asset */}
            {borrowedAssets.map((asset) => (
              <div
                key={asset.symbol}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-accent-secondary">Borrowed</span>
                <div className="flex items-center gap-2">
                  <Avatar url={asset.icon} alt={asset.symbol} size="small" />
                  <span className="text-base text-accent-primary">
                    {asset.amount} {asset.symbol}
                  </span>
                </div>
              </div>
            ))}

            {/* Health Factor Row */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">
                Health Factor
              </span>
              <span className="flex items-center gap-2 text-base text-accent-primary">
                <HeartIcon isHealthy={isHealthy} />
                {healthFactorFormatted}
              </span>
            </div>
          </div>
        </SubSection>
      ) : (
        <SubSection className="w-full py-10">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-base text-accent-primary">No active loans.</p>
            <p className="text-sm text-accent-secondary">
              Add collateral to start borrowing.
            </p>
          </div>
        </SubSection>
      )}
    </div>
  );
}
