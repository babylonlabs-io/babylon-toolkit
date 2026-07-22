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

export function LiquidationAnalysisDebugPanel() {
  const state = useLiquidationDebugState();

  return (
    <details className="rounded-lg border border-dashed border-purple-400 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-950/30">
      <summary className="cursor-pointer text-sm font-semibold text-purple-700 dark:text-purple-300">
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
              className={`flex-1 rounded border px-2 py-1 text-xs ${
                state === value
                  ? "border-orange-500 bg-orange-500/20 text-orange-700 dark:text-white"
                  : "border-zinc-400 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Forces the card&apos;s state; Auto follows the live position. The
          chart uses a placeholder cascade — switch on Manual Mode in Position
          Notifications to drive it with your own price and vaults.
        </p>
      </div>
    </details>
  );
}
