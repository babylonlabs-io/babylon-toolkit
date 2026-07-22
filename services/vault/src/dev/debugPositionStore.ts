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
  BannerSeverity,
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";
import type { ProtocolStatus } from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";

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

/**
 * One-click scenarios for the debug panel. Every banner state the dashboard can
 * render has an entry here, so this list is the single place to look up (or add)
 * a reproducible notification case. `expectedSeverity` is what
 * `deriveBannerState(calculate(params))` must return — asserted in
 * `__tests__/debugPositionStore.test.ts`, so a calculator change that moves a
 * preset off its state fails the test instead of silently mislabelling a button.
 * The stale-price banner has no preset: it is a status, not a calculation, and
 * is driven by the panel's "Simulate stale price" checkbox.
 */
export interface DebugPreset {
  label: string;
  expectedSeverity: BannerSeverity;
  params: CalculatorParams;
}

function vaults(...btc: number[]): CalculatorParams["vaults"] {
  return btc.map((amount, i) => ({
    id: `v-${i + 1}`,
    name: `Vault ${i + 1}`,
    btc: amount,
  }));
}

/** Ratio params shared by every preset — only price/debt/vaults vary. */
const PRESET_RATIOS = {
  CF: DEBUG_DEFAULT_CF,
  THF: DEBUG_DEFAULT_THF,
  maxLB: DEBUG_DEFAULT_MAX_LB,
  expectedHF: DEBUG_DEFAULT_EXPECTED_HF,
};

export const DEBUG_PRESETS: DebugPreset[] = [
  {
    label: "Urgent",
    expectedSeverity: "red",
    params: { ...makeDefaultDebugParams() },
  },
  {
    label: "Liquidatable",
    expectedSeverity: "red",
    params: {
      btcPrice: 55000,
      totalDebtUsd: 44287.72,
      vaults: vaults(0.65, 0.35),
      ...PRESET_RATIOS,
    },
  },
  {
    label: "Cliff",
    expectedSeverity: "yellow",
    params: {
      btcPrice: 90000,
      totalDebtUsd: 30000,
      vaults: vaults(1),
      ...PRESET_RATIOS,
    },
  },
  {
    label: "Too many vaults",
    expectedSeverity: "yellow",
    params: {
      btcPrice: 90000,
      totalDebtUsd: 30000,
      vaults: vaults(...Array.from({ length: 18 }, () => 0.1)),
      ...PRESET_RATIOS,
    },
  },
  {
    label: "Dust",
    expectedSeverity: "soft",
    params: {
      btcPrice: 61722.5,
      totalDebtUsd: 500,
      vaults: vaults(0.01, 0.005),
      ...PRESET_RATIOS,
    },
  },
  {
    label: "Reorder",
    expectedSeverity: "soft",
    params: {
      btcPrice: 90000,
      totalDebtUsd: 30000,
      vaults: vaults(0.2, 0.5, 0.3),
      ...PRESET_RATIOS,
    },
  },
  {
    label: "Healthy",
    expectedSeverity: "green",
    params: {
      btcPrice: 200000,
      totalDebtUsd: 20000,
      vaults: vaults(0.65, 0.35),
      ...PRESET_RATIOS,
    },
  },
];

/** Apply a preset: switches manual mode on and loads its inputs. */
export function applyDebugPreset(preset: DebugPreset) {
  manualMode = true;
  manualParams = preset.params;
  emit();
}

const NO_OVERRIDE: DebugPositionOverride = { result: null, status: null };

/**
 * Cap used when "maximum vaults reached" is forced from the panel — the
 * on-chain governance value at the time of writing, so the forced card reads
 * like the real one.
 */
export const DEBUG_FORCED_MAX_VAULTS = 10;

let manualMode = false;
let simulateStalePrice = false;
let manualParams: CalculatorParams = makeDefaultDebugParams();
let override: DebugPositionOverride = NO_OVERRIDE;
// Non-cascade notification overrides (Figma v3 §7 / §8 / §9). null = no
// override, i.e. the component uses live chain state.
let maxVaultsOverride: number | null = null;
let protocolStatusOverride: ProtocolStatus | null = null;

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

/** Force (a cap number) or release (null) the "maximum vaults reached" card. */
export function setDebugMaxVaultsOverride(cap: number | null) {
  maxVaultsOverride = cap;
  emit();
}

/** Force (a status) or release (null) the protocol soft/fully-paused banner. */
export function setDebugProtocolStatusOverride(status: ProtocolStatus | null) {
  protocolStatusOverride = status;
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

// The two overrides below are read by PRODUCTION components (the max-vaults
// notice and the protocol banner), so they are additionally gated on the
// god-mode flag — which is itself hard-gated on `import.meta.env.DEV`. In a
// production build these getters are compile-time constant `null`, exactly like
// demoArtifactDownload's mock gate, so the components always see live state.
function getMaxVaultsOverride(): number | null {
  return featureFlags.isGodModePanelEnabled ? maxVaultsOverride : null;
}

function getProtocolStatusOverride(): ProtocolStatus | null {
  return featureFlags.isGodModePanelEnabled ? protocolStatusOverride : null;
}

export function useDebugMaxVaultsOverride(): number | null {
  return useSyncExternalStore(
    subscribe,
    getMaxVaultsOverride,
    getMaxVaultsOverride,
  );
}

export function useDebugProtocolStatusOverride(): ProtocolStatus | null {
  return useSyncExternalStore(
    subscribe,
    getProtocolStatusOverride,
    getProtocolStatusOverride,
  );
}
