/**
 * BTCVaultRegistry — vault provider commission read.
 *
 * `getVaultProviderCommission(vpAddr)` is the on-chain source of truth for a
 * VP's current commission (basis points). The deposit picker surfaces this
 * value per VP so depositors can compare providers before selecting one.
 *
 * This is a display-only read: the binding commission a deposit actually
 * pays is re-read and bounded by the SDK's `PeginManager` at submit time.
 * That keeps this a non-signing-critical path, so it reads the contract
 * directly via the shared public client rather than the SDK reader (the
 * SDK reader does not expose this getter).
 */

import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address } from "viem";

import { CONTRACTS } from "@/config/contracts";
import { logger } from "@/infrastructure";

import { ethClient } from "../client";

/** Inclusive upper bound the contract enforces on commission (`< 10000`). */
const MAX_COMMISSION_BPS = 9999;

/**
 * Read a vault provider's current commission in basis points from
 * BTCVaultRegistry.
 *
 * @throws if the read fails or the contract returns a value outside the
 *         protocol-enforced `[0, 9999]` range — an out-of-range value
 *         signals a wrong contract address or ABI drift, not a real rate.
 */
export async function getVaultProviderCommissionFromChain(
  vaultProvider: Address,
): Promise<number> {
  // viem infers `number` from the `uint16` return in the `as const` ABI.
  const bps = await ethClient.getPublicClient().readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryABI,
    functionName: "getVaultProviderCommission",
    args: [vaultProvider],
  });

  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_COMMISSION_BPS) {
    throw new Error(
      `getVaultProviderCommission returned ${bps} bps for ${vaultProvider}, ` +
        `outside the protocol range [0, ${MAX_COMMISSION_BPS}]`,
    );
  }

  return bps;
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
