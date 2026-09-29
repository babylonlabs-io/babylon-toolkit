/**
 * Anchor block for the protocol-state reads a peg-in is built against.
 *
 * A Pre-PegIn commits to participant operation keys, roster versions and
 * offchain params. Those are read in several dependent rounds, and if each
 * round resolves against whatever `latest` happens to be, a rotation landing
 * between rounds produces a key set no single block ever held. The Bitcoin
 * lock built from it commits to that mixture and no counterparty agrees with
 * it. Pinning every round to one block is what removes that window.
 *
 * @module clients/eth-contract/pinnedReadBlock
 */

import { ethClient } from "./client";

/**
 * Blocks to step back from the head when choosing the anchor.
 *
 * The head itself is a poor anchor. `eth_blockNumber` and the pinned reads are
 * separate requests, and behind a load-balanced RPC endpoint they can land on
 * different nodes; one that has not yet seen the head rejects a read pinned to
 * it. Stepping back absorbs that skew. The same lag hazard is noted for the
 * activation floor in `utils/activationFloor.ts`.
 *
 * Two blocks, not more: the lag is pure cost at the other end. Everything read
 * here is compared against the chain again when the registration is included,
 * so a staler anchor only widens the window in which one of these values can
 * move and invalidate the build. Two absorbs ordinary replica skew without
 * meaningfully widening that window.
 *
 * Freshness is explicitly not the goal. What the build needs is that its reads
 * agree with each other, not that they are the newest available.
 */
const PINNED_READ_LAG_BLOCKS = 2n;

/**
 * Resolve the block every protocol-state read for one deposit build must pin
 * to.
 *
 * Call once per build and thread the result through every read that shapes the
 * Bitcoin lock — the participant-key resolution and the peg-in configuration
 * alike. Two reads pinned to different blocks are no better than two unpinned
 * reads.
 *
 * On a chain too short to step back (local test nodes near genesis) this
 * returns the head itself rather than underflowing. At exactly the lag height
 * the step back still lands on block zero, which is a valid anchor.
 */
export async function resolvePinnedReadBlock(): Promise<bigint> {
  const head = await ethClient.getPublicClient().getBlockNumber();
  return head >= PINNED_READ_LAG_BLOCKS ? head - PINNED_READ_LAG_BLOCKS : head;
}
