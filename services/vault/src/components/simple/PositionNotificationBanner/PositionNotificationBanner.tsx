import {
  Callout,
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
  NotificationCard,
  type NotificationCardTone,
} from "@/components/shared/NotificationCard";
import {
  isDepositBlocked,
  isReorderBlocked,
  isRepayBlocked,
} from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
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

// Primary-warning → v3 card tone. Exhaustive over WarningType (like
// SEVERITY_VARIANT above): `null` documents the intentional v2 fallback
// (weird-params has no v3 frame), and a new WarningType fails the typecheck
// until it is classified here. Standalone reorder is resolved ahead of this
// lookup, since it is a composite condition rather than a plain type match.
const WARNING_TONE: Record<WarningType, NotificationCardTone | null> = {
  urgent: "urgent",
  cliff: "cliff",
  reorder: "reorder",
  dust: "dust",
  "too-many-vaults": "too-many",
  "weird-params": null,
};

// Advisories the user may close in both UI versions: informational notices with
// no action to take. Unchanged from the v2 behaviour these two have always had.
const DISMISSIBLE_WARNINGS: ReadonlySet<WarningType> = new Set<WarningType>([
  "dust",
  "weird-params",
]);

// Additionally dismissible under the v3 Premium Design, whose Figma frames draw
// a close (X) on cliff (§4) and reorder (§5, including the standalone suggestion
// card). The spec covers the v3 cards only, so v2 keeps its existing X-less
// cliff/reorder. `urgent` (§1) and `too-many-vaults` (§9) are dismissible in
// neither: an imminent-liquidation warning must not be hideable. Keyed by
// warning type rather than severity because cliff/too-many-vaults share the same
// `yellow` severity but differ here.
const V3_DISMISSIBLE_WARNINGS: ReadonlySet<WarningType> = new Set<WarningType>([
  "cliff",
  "reorder",
]);

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
  const {
    executeReorder,
    isProcessing: isReordering,
    error: reorderError,
  } = useReorderVaults();
  const { applyReorderedOrder } = useReorderOverride();
  const [isReorderSuccess, setIsReorderSuccess] = useState(false);
  const [dismissedAdvisories, setDismissedAdvisories] = useState<Set<string>>(
    () => new Set(),
  );
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

  const handleDismissAdvisory = useCallback((key: string) => {
    setDismissedAdvisories((prev) => new Set(prev).add(key));
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

  // Dismissal is tracked per warning type so closing one advisory never hides a
  // different one the position later transitions into. The standalone reorder
  // card has a null primaryWarning, so it borrows the `reorder` key — it is the
  // same advisory to the user, and sharing the key means the warning-driven and
  // standalone forms of "reorder your vaults" dismiss as one thing. Dismissal
  // persists for the life of the mounted banner: transitioning away and back
  // does not resurrect it, matching the existing dust/weird-params behaviour.
  // Reorder is the one advisory whose key carries content as well as type: the
  // suggested vault-id sequence. Re-suggesting the SAME order stays dismissed,
  // but a genuinely different optimal order is a new recommendation and
  // re-surfaces the card. The sequence only moves when the position's vaults or
  // their sizes change, which is coarse enough not to flap — unlike the live
  // numbers in the warning detail (liquidation distance, HF), which is why every
  // other advisory stays keyed by type alone and a recalculated cliff boundary
  // stays hidden until remount. The urgent (red) warning, the one that must
  // never be missed, is not dismissible in either UI version.
  const advisoryType: WarningType | null = isStandaloneReorder
    ? "reorder"
    : (primaryWarning?.type ?? null);
  const dismissKey =
    advisoryType === "reorder"
      ? `reorder:${result.optimalVaultOrder?.map((vault) => vault.id).join(",") ?? ""}`
      : advisoryType;
  const canDismissType = (type: WarningType) =>
    DISMISSIBLE_WARNINGS.has(type) ||
    (featureFlags.isV3UiEnabled && V3_DISMISSIBLE_WARNINGS.has(type));
  // One card carries the primary warning AND any secondaries stacked in its
  // suggestion box, so closing it hides them too. Only offer the X when every
  // warning on the card is one the user is allowed to dismiss — otherwise a
  // dismissible cliff would let an 18-vault too-many-vaults notice (dismissible
  // in neither UI version) be closed along with it.
  const isDismissible =
    advisoryType !== null &&
    canDismissType(advisoryType) &&
    secondaryWarnings.every((warning) => canDismissType(warning.type));
  const dismissibleAdvisoryKey = isDismissible ? dismissKey : null;
  if (dismissibleAdvisoryKey && dismissedAdvisories.has(dismissibleAdvisoryKey))
    return null;

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
    // `executeReorder` submits the optimal order alongside the calculator inputs
    // it was derived from; both come from the same `usePositionNotifications`
    // "ready" branch, so in production this holds whenever an order exists. It
    // does not when a debug override supplies `result` without the live context.
    orderVerifiable: reorderVerificationContext !== null,
    depositBlocked: isDepositBlocked(gate),
    repayBlocked: isRepayBlocked(gate),
  });

  // Sub-box content: the optimal-order chips for the standalone reorder card,
  // otherwise the primary warning's own suggestion (e.g. the cliff advice —
  // urgent conveys its CTA via the action buttons instead) stacked above any
  // secondary warnings (e.g. urgent + cliff).
  let suggestion: ReactNode;
  if (isStandaloneReorder && result.optimalVaultOrder) {
    suggestion = (
      <div className="flex flex-col gap-2">
        <OptimalOrderChips vaults={result.optimalVaultOrder} />
        {reorderError && (
          <Callout variant="error" title={COPY.common.transactionFailedTitle}>
            {reorderError}
          </Callout>
        )}
      </div>
    );
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

  let v3Tone: NotificationCardTone | null = null;
  if (isStandaloneReorder) {
    v3Tone = "reorder";
  } else if (primaryWarning) {
    v3Tone = WARNING_TONE[primaryWarning.type];
  }

  // v2 and v3 share an identical prop set; branch only the component and its
  // accent prop (variant vs tone) so a prop added to one path can't be silently
  // missed on the other.
  const notificationProps = {
    title,
    icon: isStandaloneReorder || isCliffPrimary ? null : undefined,
    actions: actions.length > 0 ? actions : undefined,
    actionsPlacement:
      isStandaloneReorder || isCliffPrimary ? "below" : "inline",
    suggestion,
    onClose: dismissibleAdvisoryKey
      ? () => handleDismissAdvisory(dismissibleAdvisoryKey)
      : undefined,
    "data-testid": TEST_ID,
    "data-severity": bannerState.severity,
  } as const;

  return (
    <>
      {featureFlags.isV3UiEnabled && v3Tone ? (
        <NotificationCard
          tone={v3Tone}
          // Figma insets the cliff card's suggestion box tighter than the rest.
          suggestionPadding={isCliffPrimary ? "compact" : "comfortable"}
          {...notificationProps}
        >
          {detail}
        </NotificationCard>
      ) : (
        <Notification variant={variant} {...notificationProps}>
          {detail}
        </Notification>
      )}

      <ReorderSuccessModal
        isOpen={isReorderSuccess}
        onClose={handleReorderSuccessClose}
      />
    </>
  );
}
