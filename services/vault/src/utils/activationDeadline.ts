// Ethereum L1 consensus slot time; missed slots only make real intervals >= 12s, so 12s yields a safe UPPER bound on elapsed blocks.
export const ETH_SLOT_SECONDS = 12;

const MILLISECONDS_PER_SECOND = 1000;

/** Authoritative on-chain check: matches the contract's strict '>', so a boundary-equal block is NOT expired. */
export function isActivationDeadlinePassedOnChain(params: {
  currentBlock: bigint;
  createdAtBlock: bigint;
  pegInActivationTimeout: bigint;
}): boolean {
  const { currentBlock, createdAtBlock, pegInActivationTimeout } = params;
  return currentBlock > createdAtBlock + pegInActivationTimeout;
}

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
