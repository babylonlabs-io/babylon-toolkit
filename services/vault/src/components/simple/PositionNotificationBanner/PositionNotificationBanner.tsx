import {
  Notification,
  type NotificationVariant,
} from "@babylonlabs-io/core-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";

import { useReorderOverride } from "@/applications/aave/context";
import {
  usePositionNotifications,
  type PositionNotificationsStatus,
} from "@/applications/aave/hooks/usePositionNotifications";
import { useReorderVaults } from "@/applications/aave/hooks/useReorderVaults";
import {
  deriveBannerState,
  type BannerSeverity,
  type CalculatorResult,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { ReorderSuccessModal } from "../ReorderVaults";

import { buildBannerActions } from "./BannerActions";
import {
  GREEN_BANNER_DETAIL,
  GREEN_BANNER_TITLE,
  STALE_PRICE_BANNER_DETAIL,
  STALE_PRICE_BANNER_TITLE,
} from "./constants";
import { OptimalOrderChips } from "./OptimalOrderChips";

const TEST_ID = "position-notification-banner";

// Map the calculator's banner severity to a core-ui Notification variant. `red`
// is the urgent Figma callout (error), `soft` advisories render as info, `green`
// as success. `yellow` only arises from the stale-price status path (handled
// separately below with an early return) — mapped here so the index is total
// over every non-`hidden` severity. `hidden` renders nothing.
const SEVERITY_VARIANT: Record<
  Exclude<BannerSeverity, "hidden">,
  NotificationVariant
> = {
  red: "error",
  yellow: "warning",
  soft: "info",
  green: "success",
};

interface PositionNotificationBannerProps {
  connectedAddress?: string;
  onDeposit: (initialAmountBtc?: string) => void;
  onRepay: () => void;
  /** Override result for debug panel — skips hook when provided */
  result?: CalculatorResult | null;
  /** Override status for debug panel — used to simulate stale-price state */
  statusOverride?: PositionNotificationsStatus;
}

export function PositionNotificationBanner({
  connectedAddress,
  onDeposit,
  onRepay,
  result: resultOverride,
  statusOverride,
}: PositionNotificationBannerProps) {
  const {
    result: hookResult,
    status,
    isLoading,
    reorderVerificationContext,
  } = usePositionNotifications(connectedAddress);

  const hasOverride = resultOverride !== undefined;
  const result = hasOverride ? resultOverride : hookResult;

  const { executeReorder, isProcessing: isReordering } = useReorderVaults();
  const { applyReorderedOrder } = useReorderOverride();
  const [isReorderSuccess, setIsReorderSuccess] = useState(false);
  const [isWeirdParamsDismissed, setIsWeirdParamsDismissed] = useState(false);
  const queryClient = useQueryClient();
  const { address } = useAccount();

  const handleReorderSuccessClose = useCallback(() => {
    setIsReorderSuccess(false);
    if (address) {
      queryClient.invalidateQueries({
        queryKey: ["vaultOrder", address.toLowerCase()],
      });
      invalidateVaultQueries(queryClient, address as Address);
    }
  }, [address, queryClient]);

  const handleDismissWeirdParams = useCallback(() => {
    setIsWeirdParamsDismissed(true);
  }, []);

  const handleApplyOrder = useCallback(async () => {
    if (!result?.optimalVaultOrder || !reorderVerificationContext) return;
    const vaultIds = result.optimalVaultOrder.map((v) => v.id as Hex);
    const success = await executeReorder(vaultIds, {
      optimalOrderContext: reorderVerificationContext,
    });
    if (success) {
      // Show the just-submitted order immediately; the indexer catches up later.
      applyReorderedOrder(vaultIds);
      setIsReorderSuccess(true);
    }
  }, [result, executeReorder, reorderVerificationContext, applyReorderedOrder]);

  const effectiveStatus = statusOverride ?? status;

  // Stale-price: warning notification regardless of result.
  if (effectiveStatus === "stale-price") {
    return (
      <Notification
        variant="warning"
        title={STALE_PRICE_BANNER_TITLE}
        data-testid={TEST_ID}
        data-severity="yellow"
      >
        {STALE_PRICE_BANNER_DETAIL}
      </Notification>
    );
  }

  // When no override, respect loading states
  if (!hasOverride) {
    if (status !== "ready" || isLoading || !result) return null;
  }

  // With override, just check if result exists
  if (!result) return null;

  const bannerState = deriveBannerState(result);

  if (bannerState.severity === "hidden") return null;

  // Only the weird-params advisory is dismissible (informational, no required
  // action). The standalone reorder suggestion is also `soft` but has a null
  // primaryWarning, so it is intentionally excluded.
  const isWeirdParamsAdvisory =
    bannerState.severity === "soft" &&
    bannerState.primaryWarning?.type === "weird-params";
  if (isWeirdParamsAdvisory && isWeirdParamsDismissed) return null;

  const { primaryWarning, secondaryWarnings } = bannerState;

  // The standalone reorder suggestion (soft severity, no primaryWarning) renders
  // as the gold `suggestion` variant per Figma — distinct from the weird-params
  // advisory, which is also soft but sets primaryWarning.
  const isStandaloneReorder =
    bannerState.severity === "soft" &&
    !primaryWarning &&
    bannerState.suggestReorder;
  const variant = isStandaloneReorder
    ? "suggestion"
    : SEVERITY_VARIANT[bannerState.severity];

  // Primary content: green standalone copy / risk warning / standalone reorder.
  let title: string;
  let detail: string;
  if (bannerState.severity === "green") {
    title = GREEN_BANNER_TITLE;
    detail = GREEN_BANNER_DETAIL;
  } else if (primaryWarning) {
    title = primaryWarning.title;
    detail = primaryWarning.detail;
  } else {
    // Soft severity with no warning = standalone reorder suggestion.
    title = COPY.liquidationWarnings.reorder.title;
    detail = COPY.liquidationWarnings.reorder.detail;
  }

  const actions = buildBannerActions({
    result,
    bannerState,
    onDeposit,
    onRepay,
    onApplyOrder: handleApplyOrder,
    isReordering,
  });

  // Sub-box content: the optimal-order chips for the standalone reorder card,
  // otherwise the stacked secondary warnings (e.g. urgent + weird-params).
  let suggestion: ReactNode;
  if (isStandaloneReorder && result.optimalVaultOrder) {
    suggestion = <OptimalOrderChips vaults={result.optimalVaultOrder} />;
  } else if (secondaryWarnings.length > 0) {
    suggestion = (
      <div className="flex flex-col gap-2">
        {secondaryWarnings.map((warning, index) => (
          <div key={index}>
            <div className="text-sm font-semibold text-accent-primary">
              {warning.title}
            </div>
            {warning.detail && <div className="text-sm">{warning.detail}</div>}
            {warning.suggestion && (
              <div className="text-sm opacity-80">{warning.suggestion}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <Notification
        variant={variant}
        title={title}
        icon={isStandaloneReorder ? null : undefined}
        actions={actions.length > 0 ? actions : undefined}
        actionsPlacement={isStandaloneReorder ? "below" : "inline"}
        suggestion={suggestion}
        onClose={isWeirdParamsAdvisory ? handleDismissWeirdParams : undefined}
        data-testid={TEST_ID}
        data-severity={bannerState.severity}
      >
        {detail}
      </Notification>

      <ReorderSuccessModal
        isOpen={isReorderSuccess}
        onClose={handleReorderSuccessClose}
      />
    </>
  );
}
