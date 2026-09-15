/**
 * Transient failure of a registration-log read.
 *
 * Every registered vault has its `PegInSubmitted` log in its `createdAt`
 * block, so an Ethereum node answering that block's registration-log query
 * with no logs at all did not serve the block — load-balanced public RPCs
 * answer `[]` for a block a backend lacks instead of erroring, which viem's
 * transport retry cannot see (it retries errors only). Callers may retry.
 *
 * @module clients/eth/registration-logs-error
 */

/** The `name` this error carries, so a foreign module instance still matches. */
export const REGISTRATION_LOGS_UNAVAILABLE_ERROR_NAME =
  "RegistrationLogsUnavailableError";

export class RegistrationLogsUnavailableError extends Error {
  readonly blockNumber: bigint;

  constructor(blockNumber: bigint) {
    super(
      `The Ethereum node returned no registration logs for block ${blockNumber}, ` +
        `which holds a vault registration; the node may not have indexed that ` +
        `block yet. Try again.`,
    );
    this.name = REGISTRATION_LOGS_UNAVAILABLE_ERROR_NAME;
    this.blockNumber = blockNumber;
  }
}

/** Matches `instanceof` OR the documented `name` (dual module instances). */
export function isRegistrationLogsUnavailableError(
  err: unknown,
): err is RegistrationLogsUnavailableError {
  if (err instanceof RegistrationLogsUnavailableError) return true;
  if (typeof err !== "object" || err === null) return false;
  return (
    (err as { name?: unknown }).name ===
    REGISTRATION_LOGS_UNAVAILABLE_ERROR_NAME
  );
}
