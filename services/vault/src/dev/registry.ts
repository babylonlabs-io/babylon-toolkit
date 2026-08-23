/**
 * Registry of god-mode panel tabs (dev / QA only).
 *
 * Each tab mirrors one real-app surface. `GodModePanel` renders every VISIBLE
 * tab from this list at once (see its own header comment for why) and shows
 * only the active one. `gate`, when present, hides the tab's rail button and
 * excludes it from rendering entirely.
 */

import type { ComponentType } from "react";

import featureFlags from "@/config/featureFlags";

import { DepositVaultsPanel } from "./panels/DepositVaults";
import { GlobalPanel } from "./panels/Global";
import { LiquidationsPanel } from "./panels/Liquidations";
import { LoansPanel } from "./panels/Loans";
import { MarketsPanel } from "./panels/Markets";
import { PositionPanel } from "./panels/Position";

export interface DevPanelTab {
  id: string;
  label: string;
  Component: ComponentType;
  /** Hides the tab (rail button + content) when it returns false. */
  gate?: () => boolean;
}

/**
 * The old double-flag gate on the standalone position-notifications section
 * (`{isLiquidationNotificationsEnabled && isPositionDebugPanelEnabled}` in
 * GodModeMount), now declared once and reused by both the Position tab's
 * registry gate and the cascade simulator's own internal gate (it also lives
 * on the ungated Liquidations tab — see `panels/CascadeSimulator.tsx`).
 *
 * Gating the whole Position tab on it costs no capability: health factor and
 * borrow capacity — the tab's other content — are dual-homed on the ungated
 * Loans tab (see `panels/Loans.tsx`), and the cascade simulator + its banner
 * preview already required both flags before this refactor.
 */
export const positionDebugGate = (): boolean =>
  featureFlags.isLiquidationNotificationsEnabled &&
  featureFlags.isPositionDebugPanelEnabled;

export const DEV_PANEL_TABS: DevPanelTab[] = [
  { id: "global", label: "Global", Component: GlobalPanel },
  {
    id: "position",
    label: "Position",
    Component: PositionPanel,
    gate: positionDebugGate,
  },
  { id: "liquidations", label: "Liquidations", Component: LiquidationsPanel },
  {
    id: "deposit-vaults",
    label: "Deposit & Vaults",
    Component: DepositVaultsPanel,
  },
  { id: "loans", label: "Loans", Component: LoansPanel },
  { id: "markets", label: "Markets", Component: MarketsPanel },
];
