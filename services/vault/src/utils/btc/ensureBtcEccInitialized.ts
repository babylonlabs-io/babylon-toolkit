let initialization: Promise<void> | undefined;

/**
 * Load and register Bitcoin's ECC implementation only when a BTC transaction
 * flow is actually rendered. Keeping both imports dynamic prevents an
 * Ethereum-only application session from downloading the signing stack at
 * bootstrap while preserving bitcoinjs-lib's process-wide initialization.
 */
export function ensureBtcEccInitialized(): Promise<void> {
  if (initialization) return initialization;

  const attempt = Promise.all([
    import("@bitcoin-js/tiny-secp256k1-asmjs"),
    import("bitcoinjs-lib"),
  ]).then(([ecc, { initEccLib }]) => {
    initEccLib(ecc);
  });

  initialization = attempt.catch((error) => {
    // A transient chunk failure may be retried after the stale-deploy handler
    // reloads (or by a later user gesture if the failure was recoverable).
    initialization = undefined;
    throw error;
  });
  return initialization;
}
