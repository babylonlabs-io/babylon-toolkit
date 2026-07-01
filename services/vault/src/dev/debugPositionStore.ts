/**
 * Cross-component store for the position-notifications debug controls
 * (dev / QA only — surfaced inside the god-mode panel, gated behind
 * NEXT_PUBLIC_FF_POSITION_DEBUG_PANEL).
 *
 * Mirrors the demoDeposit store: the god-mode panel writes the control state,
 * the dashboard reads the derived override. Keeping the state in a module store
 * (rather than component state) is what lets it survive the god-mode panel's
 * float ↔ pop-out remount — the same reason demoDeposit uses this pattern.
 *
 * The store carries only the debug inputs plus the derived override the banner
 * consumes; in production nothing writes to it, so the override stays null and
 * the banner falls back to live data with zero behavioural change.
 */

import { useSyncExternalStore } from "react";

import type { PositionNotificationsStatus } from "@/applications/aave/hooks/usePositionNotifications";
import type {
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";

/** Derived banner override the dashboard reads: null result/status = use live. */
export interface DebugPositionOverride {
  result: CalculatorResult | null;
  status: PositionNotificationsStatus | null;
}

// Representative sample inputs for manual mode — a realistic starting point,
// NOT protocol parameters. The ratio defaults are exported so the panel's
// empty-input fallbacks reuse them instead of re-hardcoding the same numbers.
const DEBUG_DEFAULT_BTC_PRICE = 61722.5;
const DEBUG_DEFAULT_TOTAL_DEBT_USD = 44287.72;
export const DEBUG_DEFAULT_CF = 0.75;
export const DEBUG_DEFAULT_THF = 1.1;
export const DEBUG_DEFAULT_MAX_LB = 1.05;
export const DEBUG_DEFAULT_EXPECTED_HF = 0.95;

/** Default manual-mode inputs the panel starts from (and resets to). */
export function makeDefaultDebugParams(): CalculatorParams {
  return {
    btcPrice: DEBUG_DEFAULT_BTC_PRICE,
    totalDebtUsd: DEBUG_DEFAULT_TOTAL_DEBT_USD,
    // Two sample vaults so the liquidation-group table has something to show.
    vaults: [
      { id: "v-1", name: "Vault 1", btc: 0.65 },
      { id: "v-2", name: "Vault 2", btc: 0.35 },
    ],
    CF: DEBUG_DEFAULT_CF,
    THF: DEBUG_DEFAULT_THF,
    maxLB: DEBUG_DEFAULT_MAX_LB,
    expectedHF: DEBUG_DEFAULT_EXPECTED_HF,
  };
}

const NO_OVERRIDE: DebugPositionOverride = { result: null, status: null };

let manualMode = false;
let simulateStalePrice = false;
let manualParams: CalculatorParams = makeDefaultDebugParams();
let override: DebugPositionOverride = NO_OVERRIDE;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDebugManualMode(value: boolean) {
  manualMode = value;
  emit();
}

export function setDebugSimulateStalePrice(value: boolean) {
  simulateStalePrice = value;
  emit();
}

export function setDebugManualParams(params: CalculatorParams) {
  manualParams = params;
  emit();
}

export function resetDebugManualParams() {
  manualParams = makeDefaultDebugParams();
  emit();
}

/**
 * Publish the derived banner override. Written by the debug panel's effect and
 * read by the dashboard. Reference-guarded so an unchanged override doesn't
 * churn subscribers (mirrors React's setState bailout).
 */
export function setDebugPositionOverride(
  result: CalculatorResult | null,
  status: PositionNotificationsStatus | null,
) {
  if (override.result === result && override.status === status) return;
  override = { result, status };
  emit();
}

/** Reset every control back to its default (used by tests). */
export function resetDebugPositionState() {
  manualMode = false;
  simulateStalePrice = false;
  manualParams = makeDefaultDebugParams();
  override = NO_OVERRIDE;
  emit();
}

function getManualMode() {
  return manualMode;
}
function getSimulateStalePrice() {
  return simulateStalePrice;
}
function getManualParams() {
  return manualParams;
}
function getOverride() {
  return override;
}

export function useDebugManualMode(): boolean {
  return useSyncExternalStore(subscribe, getManualMode, getManualMode);
}

export function useDebugSimulateStalePrice(): boolean {
  return useSyncExternalStore(
    subscribe,
    getSimulateStalePrice,
    getSimulateStalePrice,
  );
}

export function useDebugManualParams(): CalculatorParams {
  return useSyncExternalStore(subscribe, getManualParams, getManualParams);
}

export function useDebugPositionOverride(): DebugPositionOverride {
  return useSyncExternalStore(subscribe, getOverride, getOverride);
}
