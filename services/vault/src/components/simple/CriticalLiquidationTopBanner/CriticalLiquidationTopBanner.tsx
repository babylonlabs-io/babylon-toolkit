import { TopBanner } from "@babylonlabs-io/core-ui";
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
 * DOM id of the slot RootLayout renders above the header. This banner portals
 * into it so a dashboard-scoped component (which has the Aave providers + the
 * debug override) can render visually above the app header.
 */
export const CRITICAL_BANNER_SLOT_ID = "critical-liquidation-banner-slot";

interface CriticalLiquidationTopBannerProps {
  /**
   * Effective position-notification result (debug override ?? live). The banner
   * shows only when this resolves to a `red` (urgent) banner severity.
   */
  result: CalculatorResult | null;
}

/**
 * Full-width critical (near-liquidation) banner shown above the header when the
 * position is at `red` severity. A non-interactive `role="alert"` so assistive
 * tech announces it; non-dismissible by design — an imminent liquidation warning
 * the user must not be able to hide. The actionable Add Collateral / Repay Debt
 * controls live on the detailed position banner below.
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

  return createPortal(
    <TopBanner
      visible
      role="alert"
      message={message}
      icon={<IoWarning size={20} className="shrink-0 text-white" />}
      // error-dark (#C62828) matches the Figma critical-banner fill; force white
      // text over it (the base banner message defaults to accent-primary) and a
      // slim strip (40px tall, 8px vertical padding) to match the design.
      className="!h-10 bg-error-dark !py-2 [&_.bbn-top-banner-message]:!font-semibold [&_.bbn-top-banner-message]:!text-white"
    />,
    slot,
  );
}
