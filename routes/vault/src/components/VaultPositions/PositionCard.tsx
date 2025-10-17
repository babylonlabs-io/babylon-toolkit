/**
 * PositionCard - Displays a position with loan details
 * Shows the same fields as VaultActivityCard's optionalDetails
 */

import { Button } from '@babylonlabs-io/core-ui';
import { bitcoinIcon } from '../../assets';

export interface PositionData {
  collateral: {
    amount: string;
    symbol: string;
    icon?: string;
    valueUSD?: string;
  };
  borrowedAmount: string;
  borrowedSymbol: string;
  totalToRepay: string;
  interestAccrued: string;
  currentLTV: number;
  liquidationLTV: number;
}

interface PositionCardProps {
  position: PositionData;
  onRepay?: () => void;
}

export function PositionCard({ position, onRepay }: PositionCardProps) {
  return (
    <div className="bg-secondary-highlight w-full space-y-4 rounded p-4">
      {/* Collateral Section */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={position.collateral.icon || bitcoinIcon}
            alt={position.collateral.symbol}
            className="size-10"
          />
          <div>
            <div className="text-accent-secondary text-sm">Collateral</div>
            <div className="text-xl font-semibold">
              {position.collateral.amount} {position.collateral.symbol}
            </div>
            {position.collateral.valueUSD && (
              <div className="text-accent-secondary text-xs">
                ≈ {position.collateral.valueUSD}
              </div>
            )}
          </div>
        </div>
        {/* Repay Button */}
        {onRepay && (
          <Button onClick={onRepay} variant="contained">
            Repay
          </Button>
        )}
      </div>

      {/* Loan Details Section */}
      <div className="border-accent-tertiary space-y-3 border-t pt-4">
        <div className="text-accent-primary text-base font-semibold">Loan Details</div>

        {/* Borrowed Amount */}
        <div className="flex justify-between">
          <span className="text-accent-secondary text-sm">Borrowed</span>
          <span className="text-sm font-medium">
            {position.borrowedAmount} {position.borrowedSymbol}
          </span>
        </div>

        {/* Total to Repay */}
        <div className="flex justify-between">
          <span className="text-accent-secondary text-sm">Total to Repay</span>
          <span className="text-sm font-medium">
            {position.totalToRepay} {position.borrowedSymbol}
          </span>
        </div>

        {/* Interest Accrued */}
        {parseFloat(position.interestAccrued) > 0 && (
          <div className="flex justify-between">
            <span className="text-accent-secondary text-sm">Interest Accrued</span>
            <span className="text-sm font-medium">
              {position.interestAccrued} {position.borrowedSymbol}
            </span>
          </div>
        )}

        {/* Current LTV */}
        {position.currentLTV > 0 && (
          <div className="flex justify-between">
            <span className="text-accent-secondary text-sm">LTV</span>
            <span className="text-sm font-medium">{position.currentLTV}%</span>
          </div>
        )}

        {/* Liquidation LTV */}
        <div className="flex justify-between">
          <span className="text-accent-secondary text-sm">Liquidation LTV</span>
          <span className="text-sm font-medium">{position.liquidationLTV}%</span>
        </div>
      </div>
    </div>
  );
}
