import { Button } from "@babylonlabs-io/core-ui";

import type {
  BannerState,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";

interface BannerActionsProps {
  result: CalculatorResult;
  bannerState: BannerState;
  onDeposit: (initialAmountBtc?: string) => void;
  onRepay: () => void;
  onApplyOrder: () => void;
  isReordering: boolean;
}

/**
 * Renders the manual actions for the position banner:
 * - urgent: "Add Collateral" + "Repay Debt" (core safety actions)
 * - suggested reorder available: "Apply Suggested Order" (manual approve)
 *
 * Both can appear together (urgent position whose order is also suboptimal).
 */
export function BannerActions({
  result,
  bannerState,
  onDeposit,
  onRepay,
  onApplyOrder,
  isReordering,
}: BannerActionsProps) {
  const { primaryWarning, suggestReorder } = bannerState;

  const isUrgent = primaryWarning?.type === "urgent";
  const showApplyOrder = suggestReorder && result.suggestedVaultOrder !== null;

  if (!isUrgent && !showApplyOrder) return null;

  return (
    <div className="mt-3 flex items-center gap-2">
      {isUrgent && (
        <>
          <Button
            variant="outlined"
            size="small"
            onClick={() => onDeposit()}
            className="rounded-full"
          >
            {COPY.banner.addCollateral}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={onRepay}
            className="rounded-full"
          >
            {COPY.banner.repayDebt}
          </Button>
        </>
      )}
      {showApplyOrder && (
        <Button
          variant="outlined"
          size="small"
          onClick={onApplyOrder}
          disabled={isReordering}
          className="rounded-full"
        >
          {isReordering
            ? COPY.common.applying
            : COPY.banner.applySuggestedOrder}
        </Button>
      )}
    </div>
  );
}
