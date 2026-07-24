/**
 * God-mode section for the Overview page's Liquidation Analysis card
 * (dev / QA only).
 *
 * The card's three states each need a different real position to reach, which
 * makes them tedious to review. This forces them directly. The chart itself is
 * still fixture-backed until the data PR lands; to drive it through a real
 * cascade, turn on Manual Mode in the Position Notifications section below —
 * its BTC price, vaults and CF feed this chart too.
 */

import {
  LIQUIDATION_DEBUG_STATES,
  setLiquidationDebugState,
  useLiquidationDebugState,
} from "./liquidationDebugStore";
import {
  PANEL_HINT_CLASS,
  PANEL_SECTION_CLASS,
  PANEL_SECTION_TITLE_CLASS,
  panelSegmentClass,
} from "./panelChrome";

export function LiquidationAnalysisDebugPanel() {
  const state = useLiquidationDebugState();

  return (
    <details className={PANEL_SECTION_CLASS}>
      <summary className={PANEL_SECTION_TITLE_CLASS}>
        Liquidation Analysis
        {state !== "auto" && ` (${state})`}
      </summary>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          {LIQUIDATION_DEBUG_STATES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setLiquidationDebugState(value)}
              className={panelSegmentClass(state === value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={PANEL_HINT_CLASS}>
          Forces the card&apos;s state; Auto follows the live position. The
          chart uses a placeholder cascade — switch on Manual Mode in Position
          Notifications to drive it with your own price and vaults.
        </p>
      </div>
    </details>
  );
}
