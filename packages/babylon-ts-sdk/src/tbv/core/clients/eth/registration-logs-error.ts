/**
 * Transient failure of a registration-log read.
 *
 * Every registered vault has its `PegInSubmitted` log in its `createdAt`
 * block, so an Ethereum node answering that block's registration-log query
 * with no logs at all did not serve the block — load-balanced public RPCs
 * answer `[]` for a block a backend lacks instead of erroring, which viem's
 * transport retry cannot see (it retries errors only). Callers may retry.
 *
 * The same holds for an answer that is merely incomplete: the registry emits
 * `PegInSubmitted` and `PegInSubmittedV2` together on every submission
 * (vault-contracts-aave-v4 `PeginLogic.sol:144-147` @ c559f5c2), so a block
 * answer carrying only some of them is a partial answer as readily as it is
 * an old registry. Those shapes carry their own message.
 *
 * @module clients/eth/registration-logs-error
 */

/** The `name` this error carries, so a foreign module instance still matches. */
export const REGISTRATION_LOGS_UNAVAILABLE_ERROR_NAME =
  "RegistrationLogsUnavailableError";

export class RegistrationLogsUnavailableError extends Error {
  readonly blockNumber: bigint;

  /**
   * `message` replaces the empty-answer wording for the partial-answer shapes
   * that are not "no logs at all"; the caller names which logs it did get.
   */
  constructor(blockNumber: bigint, message?: string) {
    super(
      message ??
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
