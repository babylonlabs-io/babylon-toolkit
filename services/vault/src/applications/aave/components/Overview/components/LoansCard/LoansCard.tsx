/**
 * LoansCard Component
 * Displays loan information with Borrow/Repay buttons or empty state
 */

import { Button, Card, SubSection } from "@babylonlabs-io/core-ui";

import { isHealthFactorHealthy } from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";

interface LoansCardProps {
  hasLoans: boolean;
  hasCollateral: boolean;
  borrowedAmount?: string;
  healthFactor?: string;
  onBorrow: () => void;
  onRepay: () => void;
}

export function LoansCard({
  hasLoans,
  hasCollateral,
  borrowedAmount,
  healthFactor,
  onBorrow,
  onRepay,
}: LoansCardProps) {
  const isHealthy = isHealthFactorHealthy(healthFactor ?? "0");

  return (
    <Card className="w-full">
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
          <div className="space-y-4">
            {/* Borrowed Row */}
            <div className="flex items-center justify-between border-b border-secondary-strokeLight pb-4">
              <span className="text-sm text-accent-secondary">Borrowed</span>
              <span className="text-base text-accent-primary">
                {borrowedAmount}
              </span>
            </div>

            {/* Health Factor Row */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">
                Health Factor
              </span>
              <span className="flex items-center gap-2 text-base text-accent-primary">
                <HeartIcon isHealthy={isHealthy} />
                {healthFactor}
              </span>
            </div>
          </div>
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
    </Card>
  );
}
