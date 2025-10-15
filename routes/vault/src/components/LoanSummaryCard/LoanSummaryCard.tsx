import { Card } from "@babylonlabs-io/core-ui";

interface LoanSummaryCardProps {
  collateralAmount: number;
  loanAmount: number;
  ltv: number;
  liquidationLtv: number;
}

export function LoanSummaryCard({
  collateralAmount,
  loanAmount,
  ltv,
  liquidationLtv,
}: LoanSummaryCardProps) {
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Collateral (BTC)</span>
          <span className="text-sm font-medium text-accent-primary">
            {collateralAmount.toFixed(4)} BTC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Loan (USDC)</span>
          <span className="text-sm font-medium text-accent-primary">
            {loanAmount.toLocaleString()} USDC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">LTV</span>
          <span className="text-sm font-medium text-accent-primary">
            {ltv.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Liquidation LTV</span>
          <span className="text-sm font-medium text-accent-primary">
            {liquidationLtv}%
          </span>
        </div>
      </div>
    </Card>
  );
}

