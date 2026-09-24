// Ethereum L1 consensus slot time; missed slots only make real intervals >= 12s, so 12s yields a safe UPPER bound on elapsed blocks.
// Exported for the activation-floor waiting text, which converts a remaining
// block count into an approximate duration. That direction is display-only —
// the floor gate itself compares block numbers, never elapsed wall-clock time.
export const ETH_SLOT_SECONDS = 12;

const MILLISECONDS_PER_SECOND = 1000;

// The authoritative on-chain check (currentBlock > createdAt + timeout) lives
// in the SDK (`@babylonlabs-io/ts-sdk/tbv/core/services` → peginState) so the
// contract-mirror rule stays co-located with its inputs and the ABI error.

/**
 * Cheap, no-RPC first pass. Uses slot time as a fixed cadence to estimate elapsed blocks.
 * Because missed slots only stretch real intervals beyond slotSeconds, this is an UPPER bound on
 * real elapsed blocks: returning false means DEFINITELY still within the window (safe to allow
 * Activate with no RPC); returning true means MAYBE expired and must be confirmed on chain.
 */
export function estimateActivationDeadlineLikelyPassed(params: {
  createdAtMs: number;
  nowMs: number;
  pegInActivationTimeout: bigint;
  slotSeconds?: number;
}): boolean {
  const {
    createdAtMs,
    nowMs,
    pegInActivationTimeout,
    slotSeconds = ETH_SLOT_SECONDS,
  } = params;

  const elapsedMs = nowMs - createdAtMs;
  // Clock skew / future createdAtMs: treat as no time elapsed -> definitely within window.
  if (elapsedMs <= 0) {
    return false;
  }

  // elapsedMs > 0 here, so the floor is already >= 0. Compare in bigint (the
  // timeout is a uint256) to avoid precision loss for very large values.
  const estimatedElapsedBlocks = BigInt(
    Math.floor(elapsedMs / MILLISECONDS_PER_SECOND / slotSeconds),
  );
  return estimatedElapsedBlocks >= pegInActivationTimeout;
}

/**
 * Blocks that must remain before the activation deadline for a
 * secret-bearing activation to be worth sending.
 *
 * Activation reveals the HTLC secret in calldata. If the transaction is mined
 * after `createdAt + pegInActivationTimeout` the contract reverts
 * `ActivationDeadlineExpired`, but `s` is public by then: the vault expires
 * with `ActivationTimeout` and anyone can broadcast the PegIn with that
 * secret. Refusing close to the deadline costs the depositor an activation
 * they were unlikely to land; sending it and losing the race costs them the
 * secret. The asymmetry is the whole reason this margin exists.
 *
 * The margin is checked right before the write, but the wallet's signing
 * prompt comes after that check and has no time limit: `writeContract` signs
 * and sends in one step. So the margin must cover the time a depositor spends
 * in that prompt as well as inclusion latency. 25 blocks is about 5 minutes
 * at a 12-second slot — room for a hardware-wallet confirmation and a few
 * missed slots, and still small against an activation window measured in
 * hundreds of blocks.
 *
 * This is a policy value, not a protocol constant — the contract enforces the
 * deadline itself and knows nothing about this margin.
 */
export const ACTIVATION_INCLUSION_MARGIN_BLOCKS = 25;
