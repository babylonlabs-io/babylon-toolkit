import { Banner, Text } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IoWarning } from "react-icons/io5";

import {
  deriveBannerState,
  type CalculatorResult,
  type Warning,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";
import { formatLiquidationDistancePercent } from "@/utils/formatting";

/**
 * DOM id of the slot RootLayout renders in its full-bleed top-banner wrapper —
 * a sibling above the sidebar/content row, so the bar spans the whole window
 * width including the side nav. This banner portals into it so a
 * dashboard-scoped component (which has the Aave providers + the debug
 * override) can render there.
 */
export const CRITICAL_BANNER_SLOT_ID = "critical-liquidation-banner-slot";

/** Figma node 10204-45613: the banner's warning glyph is 20×20, white. */
const WARNING_ICON_SIZE_PX = 20;

interface CriticalLiquidationTopBannerProps {
  /**
   * Effective position-notification result (debug override ?? live). The banner
   * shows when this resolves to a `red` (urgent) banner severity, or, with no
   * result, when `liveUrgentWarning` is set.
   */
  result: CalculatorResult | null;
  /**
   * The live Spoke health-factor warning from the same `usePositionNotifications`
   * call as `result`; null under a debug cascade override. When the hook puts it
   * into `result.warnings` it is this same object, so comparing by reference
   * tells whether the live health factor, not the calculator, made it red.
   */
  liveUrgentWarning?: Warning | null;
}

/**
 * Full-bleed critical (near-liquidation) banner shown above the header when the
 * position is at `red` severity. When the calculator's own urgent warning made
 * it red, the message is the first group's distance to liquidation. When the
 * live Spoke health factor did, or there is no calculated result, the message
 * is the live health-factor warning: the calculated distance comes from an
 * independent price and cached risk parameters, and is the figure the Spoke
 * contradicts. A non-interactive `role="alert"` (core-ui's
 * `critical` Banner variant applies it) so assistive tech announces it;
 * non-dismissible by design — an imminent liquidation warning the user must not
 * be able to hide. The actionable Add Collateral / Repay Debt controls live on
 * the detailed position banner below.
 */
export function CriticalLiquidationTopBanner({
  result,
  liveUrgentWarning,
}: CriticalLiquidationTopBannerProps) {
  // The portal target lives in RootLayout (mounted before this component);
  // resolve it on mount so we can portal into it once available.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(CRITICAL_BANNER_SLOT_ID));
  }, []);

  const bannerState = result ? deriveBannerState(result) : null;
  const firstGroup = result?.groups[0] ?? null;
  // Only the calculator's own urgent warning is backed by the first group's
  // distance. When the live health-factor warning is primary, the Spoke made
  // the position red and the distance is the figure it contradicts.
  const isCalculatorUrgent =
    bannerState?.severity === "red" &&
    bannerState.primaryWarning !== liveUrgentWarning;

  // distancePct is negative while approaching liquidation and >= 0 once the
  // position is already liquidatable (same sign convention the dashboard gauge
  // uses), so negate it before formatting the remaining buffer.
  const message =
    firstGroup && isCalculatorUrgent
      ? firstGroup.distancePct >= 0
        ? COPY.topBanner.liquidatable
        : COPY.topBanner.critical(
            formatLiquidationDistancePercent(-firstGroup.distancePct),
          )
      : liveUrgentWarning?.title;

  if (!slot || !message) return null;

  // core-ui's `critical` Banner variant already carries everything Figma node
  // 10204-45613 asks of the bar itself: `bg-error-dark` (#C62828), zero radius,
  // full width, `py-2`, centered content, `gap-4` icon↔label, white
  // (`text-accent-contrast`) which the icon inherits via `currentColor`, and
  // `role="alert"`. The 40px total height falls out of `py-2` (16px) plus the
  // 24px line-height of the 16px label — no height override needed. The only
  // delta left is the label weight: `Text variant="body1"` is 16px/0.15px
  // tracking already, Figma wants it Bold.
  return createPortal(
    <Banner variant="critical" icon={<IoWarning size={WARNING_ICON_SIZE_PX} />}>
      <Text variant="body1" className="font-bold">
        {message}
      </Text>
    </Banner>,
    slot,
  );
}
