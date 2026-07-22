/**
 * useVaultsPageData hook
 *
 * Data assembly for the v3 /vaults page: the summary-card values plus the
 * active-vaults list. Mirrors DashboardPage's demo handling — god-mode demo
 * collateral rows are merged in for display (demo rows first, real rows
 * dropped when `hideReal` is set) while the demo-free entries and financial
 * totals are returned separately for action flows (withdraw, reorder), which
 * must never see demo rows. Inert in production.
 */

import { useMemo } from "react";

import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { useDemoCollateral } from "@/dev/demoDeposit";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { CollateralVaultEntry } from "@/types/collateral";
import {
  formatBtcAmount,
  formatBtcValue,
  formatUsdValue,
} from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

export function useVaultsPageData(connectedAddress: string | undefined) {
  const {
    displayCollateralBtc,
    collateralBtc,
    collateralValueUsd,
    healthFactor,
    healthFactorStatus,
    collateralVaults,
  } = useDashboardState(connectedAddress);

  const demoCollateral = useDemoCollateral();
  const displayVaults = useMemo((): CollateralVaultEntry[] => {
    if (!demoCollateral) return collateralVaults;
    return [
      ...demoCollateral.vaults,
      ...(demoCollateral.hideReal ? [] : collateralVaults),
    ];
  }, [collateralVaults, demoCollateral]);

  // Display-only totals: when the demo changes the rendered list, the summary
  // must total the rendered rows — otherwise it reads "0" above a demo row.
  // Financial values passed to action flows stay demo-unaware.
  const demoAffectsCollateral =
    demoCollateral !== null &&
    (demoCollateral.vaults.length > 0 || demoCollateral.hideReal);
  const shownCollateralBtc = demoAffectsCollateral
    ? displayVaults.reduce((sum, vault) => sum + vault.amountBtc, 0)
    : displayCollateralBtc;

  // Liquidation-order sequence, seized-first vault leading. `collateralVaults`
  // is already liquidation-ordered by useDashboardState; demo rows keep their
  // merged position. Optimistic activating rows stay out of the sequence —
  // their liquidation position is a placeholder until the indexer ingests the
  // vault (their row hides the ordinal for the same reason) — while
  // `activeVaultsCount` still includes them so the summary matches the Active
  // Vaults section header count.
  const liquidationOrder = useMemo(() => {
    const orderedVaults = displayVaults.filter((vault) => !vault.isActivating);
    if (orderedVaults.length < 2) return null;
    return COPY.vaults.summary.liquidationOrder(
      orderedVaults.map((vault) => formatBtcValue(vault.amountBtc)),
      btcConfig.coinSymbol,
    );
  }, [displayVaults]);

  return {
    summary: {
      totalCollateralBtc: formatBtcAmount(shownCollateralBtc),
      totalCollateralUsd: formatUsdValue(collateralValueUsd),
      activeVaultsCount: displayVaults.length,
      liquidationOrder,
      healthFactor,
      healthFactorStatus,
    },
    /** Demo-merged entries for display sections only. */
    displayVaults,
    /**
     * Demo-free entries — the only list action flows may receive. Alongside
     * indexer-backed rows it still carries the optimistic `isActivating` ones,
     * which action surfaces must themselves exclude (withdraw disables them
     * per-row, reorder filters them out).
     */
    rawCollateralVaults: collateralVaults,
    collateralBtc,
    collateralValueUsd,
  };
}
