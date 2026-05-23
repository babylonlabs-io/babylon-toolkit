/**
 * BTCVaultRegistry — vault provider commission read.
 *
 * `getVaultProviderCommission(vpAddr)` is the on-chain source of truth for a
 * VP's current commission (basis points). The deposit picker surfaces this
 * value per VP so depositors can compare providers before selecting one.
 *
 * This is a display-only read: the binding commission a deposit actually
 * pays is re-read and bounded by the SDK's `PeginManager` at submit time.
 * Both paths go through the SDK's `ViemVaultRegistryReader`, which enforces
 * the contract's `[0, 9999]` range guard.
 */

import type { Address } from "viem";

import { logger } from "@/infrastructure";

import { getVaultRegistryReader } from "../sdk-readers";

/**
 * Read a vault provider's current commission in basis points from
 * BTCVaultRegistry.
 *
 * @throws if the read fails or the contract returns a value outside the
 *         protocol-enforced `[0, 9999]` range.
 */
export async function getVaultProviderCommissionFromChain(
  vaultProvider: Address,
): Promise<number> {
  return getVaultRegistryReader().getVaultProviderCommission(vaultProvider);
}

/**
 * Read commissions for many vault providers in parallel.
 *
 * @param vaultProviderIds - VP Ethereum addresses.
 * @returns Map keyed by lowercased VP address → commission in basis points.
 *          VPs whose read failed are absent from the map; the picker renders
 *          a placeholder for them rather than blocking the list.
 */
export async function fetchVaultProviderCommissions(
  vaultProviderIds: string[],
): Promise<Map<string, number>> {
  const results = await Promise.allSettled(
    vaultProviderIds.map(async (id) => ({
      id: id.toLowerCase(),
      bps: await getVaultProviderCommissionFromChain(id as Address),
    })),
  );

  const commissionById = new Map<string, number>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      commissionById.set(result.value.id, result.value.bps);
      return;
    }
    logger.warn(
      `[fetchVaultProviderCommissions] Failed to read commission for VP ` +
        `${vaultProviderIds[index]}`,
      { data: { error: result.reason } },
    );
  });

  return commissionById;
}
