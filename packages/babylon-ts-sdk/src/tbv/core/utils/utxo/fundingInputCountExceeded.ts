/**
 * The funding-input bound error, in its own module so the ETH-only
 * `tbv/core/contracts` subpath can throw it without pulling `bitcoinjs-lib`
 * in through the selector. `scripts/check-eth-build.js` enforces that.
 *
 * @module utils/utxo/fundingInputCountExceeded
 */

/**
 * Thrown when funding a Pre-PegIn would need more inputs than the
 * protocol's on-chain `maxFundingInputCount` allows in one transaction.
 */
export class FundingInputCountExceededError extends Error {
  public readonly maxInputCount: number;

  constructor(maxInputCount: number) {
    super(
      `Funding this deposit needs more than ${maxInputCount} UTXOs, the most one Pre-PegIn may spend`,
    );
    this.name = "FundingInputCountExceededError";
    this.maxInputCount = maxInputCount;
  }
}

/**
 * Type guard for {@link FundingInputCountExceededError}. Falls back to the
 * `name` check so the guard still holds across module/realm boundaries.
 */
export function isFundingInputCountExceededError(
  err: unknown,
): err is FundingInputCountExceededError {
  return (
    err instanceof FundingInputCountExceededError ||
    (err instanceof Error && err.name === "FundingInputCountExceededError")
  );
}
