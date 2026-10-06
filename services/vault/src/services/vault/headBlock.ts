/**
 * The chain head, read fresh, for the block-number deadline gates (the
 * activation deadline and floor, the Pre-PegIn broadcast ack window).
 */

import { ethClient } from "@/clients/eth-contract/client";
import {
  headBlockLagBlocks,
  isHeadBlockAheadOfClock,
  isHeadBlockStale,
} from "@/utils/activationDeadline";

export interface HeadBlock {
  number: bigint;
  /** Blocks the head may lag behind the chain, from its age (upper bound). */
  lagBlocks: bigint;
}

/**
 * `getBlock` bypasses viem's ~4s `getBlockNumber` cache, but a load-balanced
 * node can still be behind. A head too old to use (`isHeadBlockStale`), or
 * one that shows this device's clock is slow (`isHeadBlockAheadOfClock`), is
 * rejected as unreadable. A younger one is accepted, with the blocks it may
 * lag by (`headBlockLagBlocks`), so each gate can correct in its safe
 * direction: the deadline adds the lag, the floor does not.
 */
export async function readHeadBlock(): Promise<HeadBlock> {
  const head = await ethClient
    .getPublicClient()
    .getBlock({ blockTag: "latest" });
  const nowMs = Date.now();
  if (isHeadBlockStale(head.timestamp, nowMs)) {
    throw new Error(
      `RPC head block ${head.number} (timestamp ${head.timestamp}) is stale; the node is behind or this device's clock (${nowMs} ms) is fast`,
    );
  }
  if (isHeadBlockAheadOfClock(head.timestamp, nowMs)) {
    throw new Error(
      `RPC head block ${head.number} (timestamp ${head.timestamp}) is ahead of this device's clock (${nowMs} ms); the clock is slow`,
    );
  }
  return {
    number: head.number,
    lagBlocks: headBlockLagBlocks(head.timestamp, nowMs),
  };
}

/**
 * The head a deadline gate counts from: the reported head plus the blocks
 * it may lag by. A lagging head understates how much of the window is gone,
 * so the deadline must assume the latest block the chain may have reached.
 */
export function deadlineHead(head: HeadBlock): bigint {
  return head.number + head.lagBlocks;
}
