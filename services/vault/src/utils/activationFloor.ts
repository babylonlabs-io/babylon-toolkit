// Peg-in activation FLOOR — the lower bound the registry enforces in
// `_requireActivationDelayElapsed`:
//
//   revert ActivationDelayNotElapsed if block.number < verifiedAt + peginActivationDelay
//
// so activation is permitted from `verifiedAt + delay` onward (inclusive).
//
// This is the mirror image of `activationDeadline.ts`, and the fail-safe
// direction is inverted. The deadline may be *estimated* from wall-clock time
// because over-estimating elapsed blocks only escalates to an on-chain check.
// The floor may not: over-estimating elapsed blocks would open Activate early,
// which is the failure being removed. So every function here takes a real
// `currentBlock` read from chain, and slot time is used only to describe a
// block count to the user, never to decide whether the window has opened.

import { ETH_SLOT_SECONDS } from "./activationDeadline";

const SECONDS_PER_MINUTE = 60;

/**
 * Blocks remaining until activation is permitted; `0` once the window is open.
 *
 * A `peginActivationDelay` of `0` is the protocol's documented "disabled"
 * value and yields `0` here, i.e. never gated.
 */
export function activationFloorBlocksRemaining(params: {
  currentBlock: bigint;
  verifiedAt: bigint;
  peginActivationDelay: bigint;
}): number {
  const { currentBlock, verifiedAt, peginActivationDelay } = params;
  // Matches the contract exactly, including the inclusive boundary: at
  // `currentBlock === verifiedAt + delay` the difference is 0, not 1.
  const remaining = verifiedAt + peginActivationDelay - currentBlock;
  return remaining > 0n ? Number(remaining) : 0;
}

/**
 * Approximate minutes for a remaining block count, for display only.
 *
 * Rounded UP so the estimate never promises the window sooner than it opens —
 * missed slots can only stretch the real interval past `ETH_SLOT_SECONDS`.
 * A non-zero block count always reports at least 1 minute, so the text never
 * reads "~0 min" while the button is still closed.
 */
export function activationFloorMinutesRemaining(
  blocksRemaining: number,
): number {
  if (blocksRemaining <= 0) return 0;
  return Math.max(
    1,
    Math.ceil((blocksRemaining * ETH_SLOT_SECONDS) / SECONDS_PER_MINUTE),
  );
}
