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

/**
 * Resolve the card's two flags from the live position and the debug state, so
 * the forcing rule lives next to the store instead of in the dashboard's JSX.
 */
export function resolveLiquidationCardState(
  debugState: LiquidationDebugState,
  live: { hasCollateral: boolean; hasLoans: boolean },
): { hasCollateral: boolean; hasLoans: boolean } {
  switch (debugState) {
    case "no-deposit":
      return { hasCollateral: false, hasLoans: false };
    case "no-loan":
      return { hasCollateral: true, hasLoans: false };
    case "position":
      return { hasCollateral: true, hasLoans: true };
    case "auto":
      return live;
  }
}
