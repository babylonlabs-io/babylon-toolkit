import { useMemo } from "react";

import { usePositionNotifications } from "@/applications/aave/hooks/usePositionNotifications";
import type {
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";
import {
  getHealthFactorStatusFromValue,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLiquidationPositionOverride } from "@/overrides/liquidations";
import { usePositionCascadeOverride } from "@/overrides/position";

export interface LiquidationsPagePosition {
  collateralBtc: number;
  collateralValueUsd: number | null;
  debtValueUsd: number;
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
}

export interface LiquidationsPageState {
  position: LiquidationsPagePosition;
  params: CalculatorParams | null;
  result: CalculatorResult | null;
  isGodMode: boolean;
  /** The cascade override alone, or null. Distinct from `isGodMode`, which
   *  also flips on for a position-override-only state that never touches the
   *  chart — the chart's collateral factor must track the cascade. */
  cascade: { result: CalculatorResult; params: CalculatorParams } | null;
}

/**
 * The Liquidations page's precedence ladder for its position stats — the
 * position override, then the god-mode cascade's own numbers, then the live
 * `useDashboardState` figures — relocated out of the page component.
 */
export function useLiquidationsPageState(
  account: string | undefined,
): LiquidationsPageState {
  const { result: liveResult, params: liveParams } =
    usePositionNotifications(account);
  const {
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
  } = useDashboardState(account);

  // God-mode override (dev only): manual mode drives this page's whole
  // cascade, bypassing the connection/empty-state ladder below, the way
  // `DashboardPage.tsx` drives its overview card. Compile-time dead in
  // production, like the other override reads (overrides/store.ts) — nothing
  // ever sets this outside the debug panel, which is only imported behind
  // `import.meta.env.DEV`.
  // A status-only override (stale price) carries no cascade to chart, so it
  // must not put this page into god mode — it falls through to live, exactly
  // as a live stale price would.
  const cascadeOverride = usePositionCascadeOverride();
  const godMode = useMemo(
    () =>
      cascadeOverride?.result
        ? { result: cascadeOverride.result, params: cascadeOverride.params }
        : null,
    [cascadeOverride],
  );

  // Position override (dev only): a lighter-weight god-mode control that sets
  // this page's stat cards directly, without needing a real position or a
  // Manual Mode cascade. It wins for the stat cards even over an active
  // cascade above — see the `position` derivation below — while the cascade
  // (godMode/`result`) keeps driving the event cards untouched.
  const positionOverride = useLiquidationPositionOverride();
  const isGodMode = godMode !== null || positionOverride !== null;

  const result = godMode?.result ?? liveResult;
  const params = godMode?.params ?? liveParams;

  // Position stats shown above the chart. Precedence: the position override,
  // then the god-mode cascade's own numbers, then the live `useDashboardState`
  // figures — a mocked stat must never render mixed with a real one, so each
  // branch is self-contained rather than layering overrides on a live base.
  const position = useMemo((): LiquidationsPagePosition => {
    if (positionOverride) {
      const {
        collateralBtc: overrideCollateralBtc,
        debtUsd,
        healthFactor: overrideHealthFactor,
      } = positionOverride;
      // Price: the active cascade's if Manual Mode is on, else the live oracle
      // price — `params` already resolves that precedence. No price available
      // = an absent caption, not a fabricated "$0.00 USD".
      const btcPrice = params?.btcPrice ?? null;
      return {
        collateralBtc: overrideCollateralBtc,
        collateralValueUsd:
          btcPrice !== null ? overrideCollateralBtc * btcPrice : null,
        debtValueUsd: debtUsd,
        healthFactor: overrideHealthFactor,
        healthFactorStatus:
          getHealthFactorStatusFromValue(overrideHealthFactor),
      };
    }
    if (!godMode) {
      return {
        collateralBtc,
        collateralValueUsd,
        debtValueUsd,
        healthFactor,
        healthFactorStatus,
      };
    }
    const { result: gmResult, params: gmParams } = godMode;
    return {
      collateralBtc: gmParams.vaults.reduce((sum, v) => sum + v.btc, 0),
      collateralValueUsd: gmResult.collateralValue,
      debtValueUsd: gmParams.totalDebtUsd,
      healthFactor: gmResult.currentHF,
      healthFactorStatus: getHealthFactorStatusFromValue(gmResult.currentHF),
    };
  }, [
    positionOverride,
    params,
    godMode,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
  ]);

  return { position, params, result, isGodMode, cascade: godMode };
}
