/**
 * Typed absence of a vault's `VaultClaimableBy` log for a claimer key.
 *
 * Distinct from a transport failure: the scan covered the whole range and
 * found nothing. That is what a not-yet-redeemed vault looks like, and it is
 * also what a load-balanced public node that lacks the block answers, so a
 * caller that knows the vault is redeemed may retry. Name-matchable across
 * module instances like `RegistrationLogsUnavailableError`.
 *
 * @module clients/eth/claimable-event-error
 */

import type { Hex } from "viem";

/** The `name` this error carries, so a foreign module instance still matches. */
export const VAULT_CLAIMABLE_BY_NOT_FOUND_ERROR_NAME =
  "VaultClaimableByNotFoundError";

/** @experimental */
export class VaultClaimableByNotFoundError extends Error {
  constructor(
    readonly vaultId: Hex,
    readonly claimerPk: Hex,
    readonly fromBlock: bigint,
    readonly toBlock: bigint,
    detail = "the vault has not been redeemed for this key, or the node did not serve the block. Redeem first, or try again.",
    options?: ErrorOptions,
  ) {
    super(
      `No VaultClaimableBy log for vault ${vaultId} and claimer ${claimerPk} in blocks ` +
        `${fromBlock}..${toBlock}: ${detail}`,
      options,
    );
    this.name = VAULT_CLAIMABLE_BY_NOT_FOUND_ERROR_NAME;
  }
}

/** Matches `instanceof` OR the documented `name` (dual module instances). @experimental */
export function isVaultClaimableByNotFoundError(
  err: unknown,
): err is VaultClaimableByNotFoundError {
  if (err instanceof VaultClaimableByNotFoundError) return true;
  if (typeof err !== "object" || err === null) return false;
  return (
    (err as { name?: unknown }).name === VAULT_CLAIMABLE_BY_NOT_FOUND_ERROR_NAME
  );
}
