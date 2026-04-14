import { Button, Hint } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import type {
  BannerState,
  CalculatorResult,
  WarningType,
} from "@/applications/aave/positionNotifications";
import { fmt } from "@/applications/aave/positionNotifications/format";

interface BannerActionsProps {
  result: CalculatorResult;
  bannerState: BannerState;
  onDeposit: (initialAmountBtc?: string) => void;
  onRepay: () => void;
  onApplyOrder: () => void;
  isReordering: boolean;
  btcBalanceBtc?: number;
}

function formatSuggestedBtc(btc: number): string {
  return fmt(btc, 4);
}

/**
 * Wraps a button in a disabled Hint tooltip when balance is insufficient.
 */
function DepositButton({
  suggestedBtc,
  btcBalanceBtc,
  onClick,
  children,
}: {
  suggestedBtc: number | undefined;
  btcBalanceBtc: number | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  const insufficientBalance =
    suggestedBtc !== undefined &&
    btcBalanceBtc !== undefined &&
    suggestedBtc > btcBalanceBtc;

  if (insufficientBalance) {
    return (
      <Hint tooltip="Insufficient BTC balance" attachToChildren>
        <span>
          <Button
            variant="outlined"
            size="small"
            disabled
            className="rounded-full"
          >
            {children}
          </Button>
        </span>
      </Hint>
    );
  }

  return (
    <Button
      variant="outlined"
      size="small"
      onClick={onClick}
      className="rounded-full"
    >
      {children}
    </Button>
  );
}

/**
 * Renders action buttons appropriate for the current warning type.
 *
 * Stories D & E (reorder): "Apply Suggested Order" → direct execute
 * Stories A/B/C (cliff, no reorder fix): "Add Collateral" + "Repay Debt"
 * Story F/K (rebalance): "Add Vault" with suggested amount
 * Story G (urgent): "Add Collateral" + "Repay Debt" + "Apply Suggested Order" (when reorder available)
 */
export function BannerActions({
  result,
  bannerState,
  onDeposit,
  onRepay,
  onApplyOrder,
  isReordering,
  btcBalanceBtc,
}: BannerActionsProps) {
  const { primaryWarning } = bannerState;
  if (!primaryWarning) return null;

  const warningType: WarningType = primaryWarning.type;

  // Stories D & E: cliff fixable by reorder, or reorder warning
  if (warningType === "reorder" || hasReorderFix(warningType, result)) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="outlined"
          size="small"
          onClick={onApplyOrder}
          disabled={isReordering}
          className="rounded-full"
        >
          {isReordering ? "Applying..." : "Apply Suggested Order"}
        </Button>
      </div>
    );
  }

  // Story F/K: rebalance — suggest adding a vault
  if (warningType === "rebalance") {
    const suggestedBtc = result.suggestedRebalanceVaultBtc;
    return (
      <div className="mt-3 flex items-center gap-2">
        <DepositButton
          suggestedBtc={suggestedBtc ?? undefined}
          btcBalanceBtc={btcBalanceBtc}
          onClick={() =>
            onDeposit(
              suggestedBtc ? formatSuggestedBtc(suggestedBtc) : undefined,
            )
          }
        >
          {suggestedBtc
            ? `Add ${formatSuggestedBtc(suggestedBtc)} BTC Vault`
            : "Add Vault"}
        </DepositButton>
      </div>
    );
  }

  // Stories A/B/C (cliff, no reorder fix) and Story G (urgent)
  if (warningType === "cliff" || warningType === "urgent") {
    const suggestedBtc = result.suggestedNewVaultBtc;
    return (
      <div className="mt-3 flex items-center gap-2">
        <DepositButton
          suggestedBtc={suggestedBtc ?? undefined}
          btcBalanceBtc={btcBalanceBtc}
          onClick={() =>
            onDeposit(
              suggestedBtc ? formatSuggestedBtc(suggestedBtc) : undefined,
            )
          }
        >
          {suggestedBtc
            ? `Add ${formatSuggestedBtc(suggestedBtc)} BTC Collateral`
            : "Add Collateral"}
        </DepositButton>
        <Button
          variant="outlined"
          size="small"
          onClick={onRepay}
          className="rounded-full"
        >
          Repay Debt
        </Button>
        {result.suggestedVaultOrder && (
          <Button
            variant="outlined"
            size="small"
            onClick={onApplyOrder}
            disabled={isReordering}
            className="rounded-full"
          >
            {isReordering ? "Applying..." : "Apply Suggested Order"}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Cliff warning is fixable by reorder when the calculator found a better order.
 */
function hasReorderFix(
  warningType: WarningType,
  result: CalculatorResult,
): boolean {
  return warningType === "cliff" && result.suggestedVaultOrder !== null;
}
