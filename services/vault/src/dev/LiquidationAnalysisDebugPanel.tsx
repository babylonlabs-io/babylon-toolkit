/**
 * God-mode section for the Overview page's Liquidation Analysis card, and for
 * the `/liquidations` page's Position Overview (dev / QA only).
 *
 * The Overview card's three states each need a different real position to
 * reach, which makes them tedious to review; the buttons below force them
 * directly (its chart comes from the live cascade — turn on Manual Mode in
 * Position Notifications below to drive it with your own price and vaults).
 *
 * The position override sets `/liquidations`' own stat-card figures directly
 * (collateral BTC, debt, health factor), without needing a real position or a
 * Manual Mode cascade. It wins over both the live position and a Manual Mode
 * cascade for those stat cards; the cascade still drives that page's chart
 * independently, so both can be on at once.
 */

import { useEffect } from "react";

import {
  setLiquidationCardOverride,
  setLiquidationPositionOverride,
} from "@/overrides/liquidations";

import {
  LIQUIDATION_DEBUG_STATES,
  setLiquidationDebugState,
  setLiquidationPositionOverrideEnabled,
  setLiquidationPositionOverrideValues,
  useLiquidationDebugState,
  useLiquidationPositionOverrideEnabled,
  useLiquidationPositionOverrideValues,
  type LiquidationPositionOverride,
} from "./liquidationDebugStore";
import {
  PANEL_HINT_CLASS,
  PANEL_INPUT_CLASS,
  PANEL_LABEL_CLASS,
  PANEL_SECTION_CLASS,
  PANEL_SECTION_TITLE_CLASS,
  panelSegmentClass,
} from "./panelChrome";

const POSITION_FIELD_GRID_CLASS = "grid grid-cols-3 gap-x-3 gap-y-2";

function PositionOverrideControls() {
  const enabled = useLiquidationPositionOverrideEnabled();
  const values = useLiquidationPositionOverrideValues();

  useEffect(() => {
    setLiquidationPositionOverride(enabled ? values : null);
  }, [enabled, values]);

  const updateField = (
    field: keyof LiquidationPositionOverride,
    value: number,
  ) => {
    setLiquidationPositionOverrideValues({ ...values, [field]: value });
  };

  return (
    <div className="space-y-2 border-t border-zinc-700/60 pt-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            setLiquidationPositionOverrideEnabled(e.target.checked)
          }
          className="rounded"
        />
        Position override (/liquidations stat cards)
      </label>
      <div className={POSITION_FIELD_GRID_CLASS}>
        <div>
          <div className={PANEL_LABEL_CLASS}>Collateral (BTC)</div>
          <input
            type="number"
            step="0.01"
            className={PANEL_INPUT_CLASS}
            value={values.collateralBtc}
            onChange={(e) =>
              updateField("collateralBtc", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <div className={PANEL_LABEL_CLASS}>Debt ($)</div>
          <input
            type="number"
            step="1000"
            className={PANEL_INPUT_CLASS}
            value={values.debtUsd}
            onChange={(e) =>
              updateField("debtUsd", parseFloat(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <div className={PANEL_LABEL_CLASS}>Health factor</div>
          <input
            type="number"
            step="0.01"
            className={PANEL_INPUT_CLASS}
            value={values.healthFactor}
            onChange={(e) =>
              updateField("healthFactor", parseFloat(e.target.value) || 0)
            }
          />
        </div>
      </div>
      <p className={PANEL_HINT_CLASS}>
        Wins over the live position for the /liquidations stat cards above;
        Manual Mode&apos;s cascade (Position Notifications, below) still drives
        that page&apos;s chart independently — both can be on at once.
      </p>
    </div>
  );
}

export function LiquidationAnalysisDebugPanel() {
  const state = useLiquidationDebugState();

  useEffect(() => {
    setLiquidationCardOverride(state === "auto" ? null : state);
  }, [state]);

  return (
    <details className={PANEL_SECTION_CLASS}>
      <summary className={PANEL_SECTION_TITLE_CLASS}>
        Liquidation Analysis
        {state !== "auto" && ` (${state})`}
      </summary>
      <div className="mt-3 space-y-3">
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
          Forces the Overview card&apos;s state; Auto follows the live position.
        </p>
        <PositionOverrideControls />
      </div>
    </details>
  );
}
