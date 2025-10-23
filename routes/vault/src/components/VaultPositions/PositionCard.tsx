/**
 * PositionCard - Displays a position with loan details
 * Shows the same fields as VaultActivityCard's optionalDetails
 *
 * Uses positionStateMachine to determine available actions.
 */

import { Button } from '@babylonlabs-io/core-ui';
import { bitcoinIcon } from '../../assets';
import { getActionButtons, PositionAction } from '../../models/positionStateMachine';

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
  currentLTV: number;
  liquidationLTV: number;
}

interface PositionCardProps {
  position: PositionData;
  onRepay?: () => void;
  onBorrowMore?: () => void;
  onWithdraw?: () => void;
}

export function PositionCard({ position, onRepay, onBorrowMore, onWithdraw }: PositionCardProps) {
  // Get available action buttons based on position state
  const actionButtons = getActionButtons({
    collateral: parseFloat(position.collateral.amount) || 0,
    debt: parseFloat(position.borrowedAmount) || 0,
    currentLTV: position.currentLTV / 100, // Convert percentage to 0-1 scale
    liquidationLTV: position.liquidationLTV / 100, // Convert percentage to 0-1 scale
  });

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
        {/* Action Buttons - Determined by state machine */}
        <div className="flex gap-2">
          {actionButtons.map((button) => {
            // Map actions to handlers
            const onClick =
              button.action === PositionAction.REPAY ? onRepay :
              button.action === PositionAction.BORROW_MORE ? onBorrowMore :
              button.action === PositionAction.WITHDRAW ? onWithdraw :
              undefined;

            if (!onClick) return null;

            return (
              <Button
                key={button.action}
                onClick={onClick}
                variant={button.variant === 'primary' ? 'contained' : 'outlined'}
              >
                {button.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Loan Details Section */}
      <div className="border-accent-tertiary space-y-3 border-t pt-4">
        <div className="text-accent-primary text-base font-semibold">Loan Details</div>

        {/* Current Debt */}
        <div className="flex justify-between">
          <span className="text-accent-secondary text-sm">Current Debt</span>
          <span className="text-sm font-medium">
            {position.borrowedAmount} {position.borrowedSymbol}
          </span>
        </div>

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
