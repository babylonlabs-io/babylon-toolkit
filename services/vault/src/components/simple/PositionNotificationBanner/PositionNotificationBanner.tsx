import {
  InfoIcon,
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
  type WarningType,
} from "@/applications/aave/positionNotifications";
import {
  isDepositBlocked,
  isReorderBlocked,
  isRepayBlocked,
} from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { ReorderSuccessModal } from "../ReorderVaults";

import { buildBannerActions } from "./BannerActions";
import {
  GREEN_BANNER_DETAIL,
  GREEN_BANNER_TITLE,
  STALE_PRICE_BANNER_DETAIL,
  STALE_PRICE_BANNER_GRACE_MS,
  STALE_PRICE_BANNER_TITLE,
} from "./constants";
import { OptimalOrderChips } from "./OptimalOrderChips";
import { useSustainedFlag } from "./useSustainedFlag";

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

  const gate = useProtocolGateState();
  const { executeReorder, isProcessing: isReordering } = useReorderVaults();
  const { applyReorderedOrder } = useReorderOverride();
  const [isReorderSuccess, setIsReorderSuccess] = useState(false);
  const [dismissedAdvisories, setDismissedAdvisories] = useState<
    Set<WarningType>
  >(() => new Set());
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

  const handleDismissAdvisory = useCallback((type: WarningType) => {
    setDismissedAdvisories((prev) => new Set(prev).add(type));
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

  // The live feed already auto-refetches (faster while unhealthy); "stale" means
  // the on-chain oracle's own timestamp is old, which a refetch can't fix. Defer
  // the banner past a grace window so a transient blip doesn't flash it. A debug
  // override (statusOverride) shows immediately for testing.
  const isLiveStalePrice =
    statusOverride === undefined && status === "stale-price";
  const staleBannerReady = useSustainedFlag(
    isLiveStalePrice,
    STALE_PRICE_BANNER_GRACE_MS,
  );

  if (effectiveStatus === "stale-price") {
    if (statusOverride === "stale-price" || staleBannerReady) {
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
    // Within the grace window: render nothing (no stale price is ever used).
    return null;
  }

  // When no override, respect loading states
  if (!hasOverride) {
    if (status !== "ready" || isLoading || !result) return null;
  }

  // With override, just check if result exists
  if (!result) return null;

  const bannerState = deriveBannerState(result);

  if (bannerState.severity === "hidden") return null;

  // The weird-params and dust advisories are dismissible (informational, no
  // required action). Dismissal is tracked per warning type so closing one never
  // hides the other if the position later transitions between them. The
  // standalone reorder suggestion is also `soft` but has a null primaryWarning,
  // so it is intentionally excluded.
  const primaryWarningType = bannerState.primaryWarning?.type;
  const dismissibleAdvisoryType =
    bannerState.severity === "soft" &&
    (primaryWarningType === "weird-params" || primaryWarningType === "dust")
      ? primaryWarningType
      : null;
  if (
    dismissibleAdvisoryType &&
    dismissedAdvisories.has(dismissibleAdvisoryType)
  )
    return null;

  const { primaryWarning, secondaryWarnings } = bannerState;

  // The standalone reorder suggestion renders as the gold `suggestion` variant
  // per Figma — distinct from the weird-params advisory, which is also soft but
  // sets a non-reorder primaryWarning. It applies both when the calculator emits
  // a `reorder` warning (its rich title/detail drive the card) and the legacy
  // case of a suggested order with no warning object.
  const isStandaloneReorder =
    bannerState.severity === "soft" &&
    bannerState.suggestReorder &&
    (primaryWarning === null || primaryWarning.type === "reorder");
  const variant = isStandaloneReorder
    ? "suggestion"
    : SEVERITY_VARIANT[bannerState.severity];

  // The cliff ("First liquidation takes everything") renders as a vertical card
  // per Figma: no title icon-chip, the CTA stacked below, and its suggestion box
  // styled by feasibility — an info-icon row when an affordable sacrificial add
  // exists (#1948), otherwise a "SUGGESTION"-labelled block (#1949 / multi-vault).
  const isCliffPrimary = primaryWarning?.type === "cliff";
  const cliffHasAffordableAdd =
    isCliffPrimary && result.suggestedNewVaultBtc !== null;

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
    reorderBlocked: isReorderBlocked(gate),
    depositBlocked: isDepositBlocked(gate),
    repayBlocked: isRepayBlocked(gate),
  });

  // Sub-box content: the optimal-order chips for the standalone reorder card,
  // otherwise the primary warning's own suggestion (e.g. the cliff/rebalance
  // advice — urgent conveys its CTA via the action buttons instead) stacked
  // above any secondary warnings (e.g. urgent + cliff).
  let suggestion: ReactNode;
  if (isStandaloneReorder && result.optimalVaultOrder) {
    suggestion = <OptimalOrderChips vaults={result.optimalVaultOrder} />;
  } else {
    const primarySuggestion =
      primaryWarning && primaryWarning.type !== "urgent"
        ? primaryWarning.suggestion
        : undefined;

    let primarySuggestionNode: ReactNode = null;
    if (primarySuggestion) {
      if (cliffHasAffordableAdd) {
        // #1948 — affordable add: info-icon row, no label (Figma CLIFF A).
        primarySuggestionNode = (
          <div className="flex items-start gap-3">
            <InfoIcon
              size={16}
              className="mt-0.5 shrink-0 text-accent-primary"
            />
            <div className="text-sm">{primarySuggestion}</div>
          </div>
        );
      } else if (isCliffPrimary) {
        // #1949 / multi-vault — no CTA: "SUGGESTION" label, no icon (Figma CLIFF B).
        primarySuggestionNode = (
          <div className="flex flex-col gap-1">
            <div className="tracking-wider text-xs font-medium uppercase text-accent-secondary">
              {COPY.liquidationWarnings.cliff.suggestionLabel}
            </div>
            <div className="text-sm">{primarySuggestion}</div>
          </div>
        );
      } else {
        primarySuggestionNode = (
          <div className="text-sm opacity-80">{primarySuggestion}</div>
        );
      }
    }

    if (primarySuggestionNode || secondaryWarnings.length > 0) {
      suggestion = (
        <div className="flex flex-col gap-2">
          {primarySuggestionNode}
          {secondaryWarnings.map((warning, index) => (
            <div key={index}>
              <div className="text-sm font-semibold text-accent-primary">
                {warning.title}
              </div>
              {warning.detail && (
                <div className="text-sm">{warning.detail}</div>
              )}
              {warning.suggestion && (
                <div className="text-sm opacity-80">{warning.suggestion}</div>
              )}
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <>
      <Notification
        variant={variant}
        title={title}
        icon={isStandaloneReorder || isCliffPrimary ? null : undefined}
        actions={actions.length > 0 ? actions : undefined}
        actionsPlacement={
          isStandaloneReorder || isCliffPrimary ? "below" : "inline"
        }
        suggestion={suggestion}
        onClose={
          dismissibleAdvisoryType
            ? () => handleDismissAdvisory(dismissibleAdvisoryType)
            : undefined
        }
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
