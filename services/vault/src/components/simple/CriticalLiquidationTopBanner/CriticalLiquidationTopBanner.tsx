import { Banner, Text } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IoWarning } from "react-icons/io5";

import {
  deriveBannerState,
  type CalculatorResult,
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
   * shows only when this resolves to a `red` (urgent) banner severity.
   */
  result: CalculatorResult | null;
}

/**
 * Full-bleed critical (near-liquidation) banner shown above the header when the
 * position is at `red` severity. A non-interactive `role="alert"` (core-ui's
 * `critical` Banner variant applies it) so assistive tech announces it;
 * non-dismissible by design — an imminent liquidation warning the user must not
 * be able to hide. The actionable Add Collateral / Repay Debt controls live on
 * the detailed position banner below.
 */
export function CriticalLiquidationTopBanner({
  result,
}: CriticalLiquidationTopBannerProps) {
  // The portal target lives in RootLayout (mounted before this component);
  // resolve it on mount so we can portal into it once available.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(CRITICAL_BANNER_SLOT_ID));
  }, []);

  const bannerState = result ? deriveBannerState(result) : null;
  const firstGroup = result?.groups[0] ?? null;

  if (!slot || bannerState?.severity !== "red" || !firstGroup) {
    return null;
  }

  // distancePct is negative while approaching liquidation and >= 0 once the
  // position is already liquidatable (same sign convention the dashboard gauge
  // uses), so negate it before formatting the remaining buffer.
  const message =
    firstGroup.distancePct >= 0
      ? COPY.topBanner.liquidatable
      : COPY.topBanner.critical(
          formatLiquidationDistancePercent(-firstGroup.distancePct),
        );

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
