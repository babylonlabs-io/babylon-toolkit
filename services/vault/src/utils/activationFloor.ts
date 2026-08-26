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
// which is the failure being removed. So `activationFloorBlocksRemaining`
// takes a real `currentBlock` read from chain, and slot time is used only to
// describe a block count to the user, never to decide whether the window has
// opened.

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
  // `0` disables the floor entirely — do not compare `verifiedAt` against
  // `currentBlock`. A just-verified vault can be read with `verifiedAt` one
  // block ahead of a lagging `getBlockNumber`, and that comparison would
  // gate a window the contract is not enforcing.
  if (peginActivationDelay === 0n) return 0;
  // Matches the contract exactly, including the inclusive boundary: at
  // `currentBlock === verifiedAt + delay` the difference is 0, not 1.
  const remaining = verifiedAt + peginActivationDelay - currentBlock;
  return remaining > 0n ? Number(remaining) : 0;
}

/**
 * Whether a remaining-blocks reading should hold Activate closed.
 *
 * - `undefined` — not gated (window open, or the feature is off)
 * - `0` — not gated (inclusive boundary; the window is open)
 * - `null` — gated, duration unknown (fail-closed)
 * - `> 0` — gated, that many blocks remain
 */
export function isActivationFloorGating(
  remaining: number | null | undefined,
): remaining is number | null {
  return remaining === null || (remaining !== undefined && remaining > 0);
}

/**
 * Approximate minutes for a remaining block count, for display only.
 *
 * Rounded UP only to avoid under-reporting the fractional minute. Note this is
 * a LOWER bound on the real wait, not an upper one: N blocks take at least
 * N*`ETH_SLOT_SECONDS`, and missed slots stretch that further, so the window
 * can open later than the estimate suggests. That is display-only slack — the
 * gate itself compares block numbers and is unaffected.
 *
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
