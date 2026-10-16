const MS_PER_SECOND = 1000;

/**
 * Raised by the vault's SDK reader cache when the protocol contract addresses
 * are past their maximum stale age and the registry could not be re-read.
 */
export class StaleProtocolAddressesError extends Error {
  constructor(
    chainId: number,
    ageMs: number,
    maxStaleMs: number,
    options?: ErrorOptions,
  ) {
    super(
      `Could not refresh the protocol contract addresses for chain ${chainId}. The last successful refresh was ${Math.round(ageMs / MS_PER_SECOND)} s ago, and addresses older than ${Math.round(maxStaleMs / MS_PER_SECOND)} s are not used. Check your connection and try again.`,
      options,
    );
    this.name = "StaleProtocolAddressesError";
  }
}

// `instanceof` alone fails across module boundaries (duplicate copies, test
// mocks). Fall back to the name field, as the SDK's drift guards do.
export function isStaleProtocolAddressesError(
  err: unknown,
): err is StaleProtocolAddressesError {
  return (
    err instanceof StaleProtocolAddressesError ||
    (err instanceof Error && err.name === "StaleProtocolAddressesError")
  );
}
