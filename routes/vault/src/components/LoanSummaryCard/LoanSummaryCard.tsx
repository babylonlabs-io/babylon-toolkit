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
          <span className="text-accent-secondary text-sm">Collateral (BTC)</span>
          <span className="text-accent-primary text-sm font-medium">
            {collateralAmount.toFixed(4)} BTC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-accent-secondary text-sm">Loan (USDC)</span>
          <span className="text-accent-primary text-sm font-medium">
            {loanAmount.toLocaleString()} USDC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-accent-secondary text-sm">LTV</span>
          <span className="text-accent-primary text-sm font-medium">
            {ltv.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-accent-secondary text-sm">Liquidation LTV</span>
          <span className="text-accent-primary text-sm font-medium">
            {liquidationLtv}%
          </span>
        </div>
      </div>
    </Card>
  );
}

