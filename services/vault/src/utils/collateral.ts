/**
 * Collateral utility functions
 * Business logic for filtering and transforming collateral data.
 */

import type { AavePositionCollateral } from "@/applications/aave/services/fetchPositions";
import type { CollateralVaultEntry } from "@/types/collateral";

import { truncateAddress } from "./addressUtils";
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
 * Derives a display status from vault data.
 * If vault is in use, returns "In use". Otherwise capitalizes the vault status.
 */
function deriveStatus(vault: AavePositionCollateral["vault"]): string {
  if (!vault) return "Unknown";
  if (vault.inUse) return "In use";
  const s = vault.status;
  return s
    ? s
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Unknown";
}

/**
 * Filters and maps raw Aave position collaterals to display-friendly entries.
 * Excludes withdrawn and liquidated collaterals.
 *
 * @param collaterals - Raw collateral data from GraphQL
 * @param providerNames - Optional map of provider address (lowercase) to display name
 */
export function toCollateralVaultEntries(
  collaterals: AavePositionCollateral[],
  providerNames?: Map<string, string>,
): CollateralVaultEntry[] {
  return collaterals.filter(isActiveCollateral).map((c) => {
    const providerAddress = c.vault?.vaultProvider ?? "";
    const providerName =
      providerNames?.get(providerAddress.toLowerCase()) ??
      (providerAddress ? truncateAddress(providerAddress) : "Unknown");

    return {
      id: `${c.depositorAddress}-${c.vaultId}`,
      vaultId: c.vaultId,
      amountBtc: satoshiToBtcNumber(c.amount),
      addedAt: Number(c.addedAt),
      inUse: c.vault?.inUse ?? false,
      status: deriveStatus(c.vault),
      vaultProviderName: providerName,
    };
  });
}
