import { createOverrideStore } from "./store";

/** Which of the `/liquidations` card's mutually exclusive states to force.
 *  `null` (the default, and the only value production can ever see) leaves
 *  it derived from the live position. */
export type LiquidationCardOverride =
  | "no-deposit"
  | "no-loan"
  | "position"
  | null;

/** The `/liquidations` page's stat-card figures, set directly from the panel. */
export interface LiquidationPositionOverride {
  collateralBtc: number;
  debtUsd: number;
  healthFactor: number;
}

const liquidationCardOverrideStore =
  createOverrideStore<LiquidationCardOverride>();
const liquidationPositionOverrideStore =
  createOverrideStore<LiquidationPositionOverride>();

export const useLiquidationCardOverride = liquidationCardOverrideStore.useValue;
export const setLiquidationCardOverride = liquidationCardOverrideStore.set;

export const useLiquidationPositionOverride =
  liquidationPositionOverrideStore.useValue;
export const setLiquidationPositionOverride =
  liquidationPositionOverrideStore.set;

/**
 * Resolve the card's two flags from the live position and the override, so
 * the forcing rule lives next to the store instead of in the dashboard's JSX.
 */
export function resolveLiquidationCardState(
  override: LiquidationCardOverride,
  live: { hasCollateral: boolean; hasLoans: boolean },
): { hasCollateral: boolean; hasLoans: boolean } {
  switch (override) {
    case "no-deposit":
      return { hasCollateral: false, hasLoans: false };
    case "no-loan":
      return { hasCollateral: true, hasLoans: false };
    case "position":
      return { hasCollateral: true, hasLoans: true };
    case null:
      return live;
  }
}
