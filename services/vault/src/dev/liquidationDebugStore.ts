/**
 * Cross-component store for the Liquidation Analysis debug controls (dev / QA
 * only — surfaced inside the god-mode panel).
 *
 * Same shape as demoDeposit / debugPositionStore: the panel writes, the
 * dashboard reads, and the state lives in a module store so it survives the
 * god-mode panel's float ↔ pop-out remount.
 *
 * The card has three mutually exclusive states that otherwise need a real
 * position to reach — no collateral, collateral without a loan, and the chart.
 * `auto` (the default, and the only value production can ever see) leaves them
 * derived from the live position.
 *
 * The position override below is a separate concern: it sets the
 * `/liquidations` page's own stat-card figures (collateral BTC, debt, health
 * factor) directly, without needing a real position or a Position
 * Notifications Manual Mode cascade. `enabled: false` (the default, and the
 * only value production can ever see) leaves it null, i.e. live.
 */

import { useSyncExternalStore } from "react";

export type LiquidationDebugState =
  | "auto"
  | "no-deposit"
  | "no-loan"
  | "position";

export const LIQUIDATION_DEBUG_STATES: {
  value: LiquidationDebugState;
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "no-deposit", label: "No deposit" },
  { value: "no-loan", label: "No loan" },
  { value: "position", label: "Position" },
];

let state: LiquidationDebugState = "auto";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setLiquidationDebugState(next: LiquidationDebugState) {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

function getState() {
  return state;
}

export function useLiquidationDebugState(): LiquidationDebugState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The `/liquidations` page's stat-card figures, set directly from the panel. */
export interface LiquidationPositionOverride {
  collateralBtc: number;
  debtUsd: number;
  healthFactor: number;
}

// Representative sample position — a realistic starting point, NOT protocol
// parameters.
const DEFAULT_POSITION_COLLATERAL_BTC = 1;
const DEFAULT_POSITION_DEBT_USD = 45_000;
const DEFAULT_POSITION_HEALTH_FACTOR = 1.2;

let positionOverrideEnabled = false;
let positionOverrideValues: LiquidationPositionOverride = {
  collateralBtc: DEFAULT_POSITION_COLLATERAL_BTC,
  debtUsd: DEFAULT_POSITION_DEBT_USD,
  healthFactor: DEFAULT_POSITION_HEALTH_FACTOR,
};

export function setLiquidationPositionOverrideEnabled(enabled: boolean) {
  if (positionOverrideEnabled === enabled) return;
  positionOverrideEnabled = enabled;
  for (const listener of listeners) listener();
}

export function setLiquidationPositionOverrideValues(
  values: LiquidationPositionOverride,
) {
  positionOverrideValues = values;
  for (const listener of listeners) listener();
}

function getPositionOverrideEnabled() {
  return positionOverrideEnabled;
}

function getPositionOverrideValues() {
  return positionOverrideValues;
}

export function useLiquidationPositionOverrideEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    getPositionOverrideEnabled,
    getPositionOverrideEnabled,
  );
}

export function useLiquidationPositionOverrideValues(): LiquidationPositionOverride {
  return useSyncExternalStore(
    subscribe,
    getPositionOverrideValues,
    getPositionOverrideValues,
  );
}
