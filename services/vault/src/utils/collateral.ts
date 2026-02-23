/**
 * Collateral utility functions
 * Business logic for filtering and transforming collateral data.
 */

import type { AavePositionCollateral } from "@/applications/aave/services/fetchPositions";
import type { CollateralVaultEntry } from "@/types/collateral";

import { satoshiToBtcNumber } from "./btcConversion";

/** Vault statuses that should be excluded from the collateral display */
const EXCLUDED_VAULT_STATUSES = new Set(["liquidated", "depositor_withdrawn"]);

/**
 * Checks whether a collateral entry is active (not removed, not excluded status).
 */
function isActiveCollateral(collateral: AavePositionCollateral): boolean {
  if (collateral.removedAt !== null) return false;

  const status = collateral.vault?.status;
  if (status && EXCLUDED_VAULT_STATUSES.has(status)) return false;

  return true;
}

/**
 * Filters and maps raw Aave position collaterals to display-friendly entries.
 * Excludes withdrawn and liquidated collaterals.
 */
export function toCollateralVaultEntries(
  collaterals: AavePositionCollateral[],
): CollateralVaultEntry[] {
  return collaterals.filter(isActiveCollateral).map((c) => ({
    id: c.id,
    vaultId: c.vaultId,
    amountBtc: satoshiToBtcNumber(c.amount),
    addedAt: Number(c.addedAt),
  }));
}
