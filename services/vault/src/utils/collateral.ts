/**
 * Collateral utility functions
 * Business logic for filtering and transforming collateral data.
 */

import type { AavePositionCollateral } from "@/applications/aave/services/fetchPositions";
import type { CollateralVaultEntry } from "@/types/collateral";
import type { VaultProvider } from "@/types/vaultProvider";

import { truncateHash } from "./addressUtils";
import { satoshiToBtcNumber } from "./btcConversion";

/** Vault statuses that should be excluded from the collateral display */
const EXCLUDED_VAULT_STATUSES = new Set(["liquidated", "depositor_withdrawn"]);

/** Resolves a vault provider address to display name and icon */
type ProviderResolver = (address: string) => VaultProvider | undefined;

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
  findProvider?: ProviderResolver,
): CollateralVaultEntry[] {
  return collaterals.filter(isActiveCollateral).map((c) => {
    const providerAddress = c.vault?.vaultProvider ?? "";
    const provider = findProvider?.(providerAddress);

    return {
      id: `${c.depositorAddress}-${c.vaultId}`,
      vaultId: c.vaultId,
      peginTxHash: c.vault?.peginTxHash,
      amountBtc: satoshiToBtcNumber(c.amount),
      addedAt: Number(c.addedAt),
      inUse: c.vault?.inUse ?? false,
      providerAddress: providerAddress,
      providerName: provider?.name ?? truncateHash(providerAddress),
      providerIconUrl: provider?.iconUrl,
      depositorBtcPubkey: c.vault?.depositorBtcPubKey,
      depositorPayoutBtcAddress: c.vault?.depositorPayoutBtcAddress,
      liquidationIndex: c.liquidationIndex,
    };
  });
}
