/**
 * Assert that the per-vault collateral amounts a user reviewed equal the
 * amounts `BTCVaultRegistry` holds, before the wallet prompt fires.
 *
 * SECURITY.md (Indexer): an indexer-sourced value must not reach a
 * signature or an amount displayed as authoritative for an irreversible
 * action. The manual reorder modal shows each vault's indexer `amount` and
 * signs the liquidation order the user chose from those amounts. The
 * existing guards do not catch a swapped amount:
 *
 * - Guard A (`assertReorderMembership`) compares vault-ID multisets only.
 * - Guard C (`assertReorderBaseline`) compares vault-ID orderings only.
 * - `positionService` checks the vault-ID set, the row count and the total
 *   sum, so an indexer can swap the amounts of two real vault IDs and keep
 *   every one of those checks green.
 *
 * This guard re-reads each vault's amount from the registry and refuses on
 * any difference. It fails closed: a missing vault, a non-ACTIVE status, a
 * vault bound to another application or an RPC failure all refuse.
 */

import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Address, Hex } from "viem";

import { getBtcVaultBasicInfoFromChain } from "@/clients/eth-contract/btc-vault-registry/query";

export class CollateralAmountMismatchError extends Error {
  readonly code = "COLLATERAL_AMOUNT_MISMATCH";
}

/**
 * The registry read did not return verified data for every vault, so
 * nothing was compared. Distinct from a per-vault mismatch.
 */
export class CollateralRegistryReadError extends Error {
  readonly code = "COLLATERAL_REGISTRY_READ_FAILED";
}

/** A vault and the satoshi amount the user reviewed for it. */
export interface CollateralAmountPair {
  vaultId: Hex;
  amountSats: bigint;
}

/**
 * Read each vault's registry amount and check the signing-critical fields
 * the reorder guards require: present, ACTIVE, bound to the trusted adapter.
 *
 * Shared by this guard and by Guard B (`assertOptimalOrderMatchesOnChain`),
 * which keep their own error classes for the per-vault checks through
 * `makeError`. A failed read throws `CollateralRegistryReadError` for both.
 *
 * @returns the on-chain satoshi amounts, aligned to `vaultIds`.
 */
export async function readTrustedVaultAmountsSats(
  vaultIds: readonly Hex[],
  trustedAdapterAddress: Address,
  makeError: (message: string) => Error,
): Promise<readonly bigint[]> {
  let basicInfo: Awaited<ReturnType<typeof getBtcVaultBasicInfoFromChain>>;
  try {
    basicInfo = await getBtcVaultBasicInfoFromChain(vaultIds);
  } catch (cause) {
    throw new CollateralRegistryReadError(
      `Registry read failed for the vaults to verify: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }

  return vaultIds.map((id) => {
    const info = basicInfo.get(id.toLowerCase() as Hex);
    if (info === undefined) {
      throw makeError(
        `On-chain basic info for vault ${id} not returned by registry multicall.`,
      );
    }
    if (info.status !== ContractStatus.ACTIVE) {
      throw makeError(
        `Vault ${id} has on-chain status ${info.status}, expected ACTIVE (${ContractStatus.ACTIVE}). Refusing to sign against a non-active vault.`,
      );
    }
    if (
      info.applicationEntryPoint.toLowerCase() !==
      trustedAdapterAddress.toLowerCase()
    ) {
      throw makeError(
        `Vault ${id} is bound to application ${info.applicationEntryPoint}, expected the env-pinned Aave adapter ${trustedAdapterAddress}.`,
      );
    }
    return info.amount;
  });
}

/**
 * Refuse to sign when any reviewed amount differs from the registry amount.
 *
 * @param pairs - The vaults and amounts the user reviewed, in any order. Each
 *   amount is compared with the registry amount of its own vault.
 * @param trustedAdapterAddress - Env-pinned AaveIntegrationAdapter, read from
 *   `getAaveAdapterAddress()` at the call site.
 * @throws {CollateralAmountMismatchError} on empty input, on any per-vault
 *   registry check failure, or on the first amount that differs.
 * @throws {CollateralRegistryReadError} when the registry read fails.
 */
export async function assertCollateralAmountsMatchOnChain(
  pairs: readonly CollateralAmountPair[],
  trustedAdapterAddress: Address,
): Promise<void> {
  if (pairs.length === 0) {
    throw new CollateralAmountMismatchError(
      "No collateral amounts to verify. Refusing to sign.",
    );
  }

  const onChainAmounts = await readTrustedVaultAmountsSats(
    pairs.map((pair) => pair.vaultId),
    trustedAdapterAddress,
    (message) => new CollateralAmountMismatchError(message),
  );

  for (let i = 0; i < pairs.length; i++) {
    if (onChainAmounts[i] !== pairs[i].amountSats) {
      throw new CollateralAmountMismatchError(
        `Vault ${pairs[i].vaultId} shows an amount that differs from the registry amount. Refusing to sign against an amount the chain does not confirm.`,
      );
    }
  }
}
