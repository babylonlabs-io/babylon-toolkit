/**
 * Pure helpers for the acknowledgment-deadline gate on a Pre-PegIn broadcast.
 *
 * A registered deposit must be acknowledged (`submitACK`) by
 * `createdAt + pegInAckTimeout`. The ACK comes only after the Pre-PegIn has
 * reached the vault provider's confirmation depth and passed its pipeline, so
 * a broadcast made with less room than that locks BTC into an HTLC that can
 * never be acknowledged and is released only by the refund path. The
 * authoritative check is the contract's; these helpers decide, from live block
 * numbers, whether a broadcast still has a chance of being acknowledged.
 */

import {
  BTC_BLOCK_TIME_MINS,
  DEPOSIT_PIPELINE_OVERHEAD_MINS,
} from "@/constants";

import { ETH_SLOT_SECONDS } from "./activationDeadline";

const SECONDS_PER_MINUTE = 60;

/**
 * Minutes for the keepers and challengers to receive the on-chain PegIn
 * input-signature batch they acknowledge against.
 *
 * vaultd delivers every Ethereum event to them at the `Finalized` level in
 * production, two epochs behind the head, and they obtain the signatures
 * only from that event (btc-vault @ 91d479c: `eth-client/src/config.rs:16-17`
 * "~12-15 min, 2 epochs", `vaultd/src/workers/persistable_event_poller.rs:53-60`,
 * `vaultd/src/workers/claimer/pegin/pegin_depth.rs:285-288`). The progress
 * card's `DEPOSIT_PIPELINE_OVERHEAD_MINS` covers the signature and ACK rounds
 * and their transactions but not this wait, so the gate adds it; the upper
 * end of the daemon's own figure is used.
 */
const ETH_FINALIZED_EVENT_DELIVERY_MINS = 15;

/**
 * Blocks that can still be mined before the acknowledgment deadline.
 *
 * The contract accepts an ACK mined at `createdAt + pegInAckTimeout` and
 * reverts one block later (`block.number > createdAt + pegInAckTimeout`,
 * PeginLogic.submitACK, vault-contracts-aave-v4 @ c13d0f6). From a head at
 * block H the room left is therefore `deadline - H`, and 0 once the head is
 * the deadline block itself. The activation deadline's twin lives in the SDK
 * (`activationDeadlineBlocksRemaining`); this one stays in the dApp so the
 * SDK surface is unchanged.
 */
export function ackDeadlineBlocksRemaining(params: {
  currentBlock: bigint;
  createdAtBlock: bigint;
  pegInAckTimeout: bigint;
}): number {
  const { currentBlock, createdAtBlock, pegInAckTimeout } = params;
  const lastUsableBlock = createdAtBlock + pegInAckTimeout;
  if (currentBlock >= lastUsableBlock) return 0;
  return Number(lastUsableBlock - currentBlock);
}

/**
 * Blocks that must remain before the acknowledgment deadline for a Pre-PegIn
 * broadcast to be worth signing.
 *
 * The ACK cannot be submitted before the Pre-PegIn has `minPrepeginDepth`
 * Bitcoin confirmations, the keepers have received the finalized signature
 * batch and the ACK round has run. This is that machine-paced estimate
 * converted to Ethereum blocks and rounded up: the progress card's total
 * (`computeTotalEstimateMinutes`) plus the finalized event delivery it omits.
 * It is an estimate of the expected time, not a bound — Bitcoin blocks are
 * not schedulable — and it excludes the depositor's own presigning step, so a
 * broadcast admitted just above it has uncertain odds, and one refused at it
 * is unlikely, not certain, to have missed the deadline.
 *
 * This is a policy value, not a protocol constant — the contract enforces the
 * deadline itself and knows nothing about this margin.
 */
export function prePeginBroadcastAckMarginBlocks(
  minPrepeginDepth: number,
): number {
  const pipelineMinutes =
    minPrepeginDepth * BTC_BLOCK_TIME_MINS +
    DEPOSIT_PIPELINE_OVERHEAD_MINS +
    ETH_FINALIZED_EVENT_DELIVERY_MINS;
  return Math.ceil((pipelineMinutes * SECONDS_PER_MINUTE) / ETH_SLOT_SECONDS);
}
