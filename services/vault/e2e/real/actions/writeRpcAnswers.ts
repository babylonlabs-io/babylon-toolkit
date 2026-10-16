/**
 * What the reorg injection answers for one call to the app's RPC (see aaveWriteRpc.ts, which routes the
 * calls here). Kept free of Playwright and the network profile so it can be unit-tested on its own.
 */
import { type Hex } from "viem";

import { type ReorgInjection } from "../config";

/** A parent hash no block has: under `orphaned`, the blocks above the write's point here. */
const ORPHAN_PARENT_HASH: Hex = `0x${"ba".repeat(32)}`;

const HEX_QUANTITY_RX = /^0x[0-9a-f]+$/i;

/** The Aave write as the app's RPC first reported it mined. */
export interface MinedWrite {
  hash: Hex;
  blockNumber: bigint;
  blockHash: Hex;
}

/** What the watch has seen of the app's RPC answers, and what it is doing to them. */
export interface WriteRpcState {
  /** The connected account, lowercased: the write's sender. */
  account: string;
  /** The Aave adapter, lowercased: the write's target (a repay's approve targets the token instead). */
  adapter: string;
  reorg: ReorgInjection | undefined;
  /** True while the injection holds; false once released, or with no injection. */
  holding: boolean;
  write: MinedWrite | null;
  /** How many blocks above the write's the app has read by number, as the chain served them. */
  deepestReadAbove: bigint;
  /**
   * The app asked for a block above the write's that the chain did not have yet, so it had to wait for
   * the write to get deep enough (and showed "Confirming..." meanwhile).
   */
  waitedForDepth: boolean;
  /** How many answers the injection changed. */
  tampered: number;
}

export function createWriteRpcState(
  account: string,
  adapter: string,
  reorg: ReorgInjection | undefined,
): WriteRpcState {
  return {
    account: account.toLowerCase(),
    adapter: adapter.toLowerCase(),
    reorg,
    holding: reorg !== undefined,
    write: null,
    deepestReadAbove: 0n,
    waitedForDepth: false,
    tampered: 0,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function lowercased(value: unknown): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}

/**
 * The answer the app gets for one JSON-RPC call, given the RPC's real `result`, and what the watch
 * learns from it. The first receipt of the account's call to the adapter always reaches the app: that is
 * the write being mined, which the app must see before a reorganization can take it back.
 */
export function answerWriteRpcCall(
  state: WriteRpcState,
  method: string,
  params: readonly unknown[],
  result: unknown,
): unknown {
  if (method === "eth_getTransactionReceipt" && isRecord(result)) {
    if (state.write === null) {
      if (
        lowercased(result.to) === state.adapter &&
        lowercased(result.from) === state.account &&
        typeof result.transactionHash === "string" &&
        typeof result.blockNumber === "string" &&
        typeof result.blockHash === "string"
      ) {
        state.write = {
          hash: result.transactionHash as Hex,
          blockNumber: BigInt(result.blockNumber),
          blockHash: result.blockHash as Hex,
        };
      }
      return result;
    }
    if (
      state.holding &&
      state.reorg === "dropped" &&
      lowercased(result.transactionHash) === state.write.hash.toLowerCase()
    ) {
      state.tampered += 1;
      return null;
    }
    return result;
  }

  if (method === "eth_getBlockByNumber") {
    const tag = params[0];
    if (
      state.write === null ||
      typeof tag !== "string" ||
      !HEX_QUANTITY_RX.test(tag)
    )
      return result;
    const above = BigInt(tag) - state.write.blockNumber;
    if (above <= 0n) return result;
    if (!isRecord(result)) {
      state.waitedForDepth = true;
      return result;
    }
    if (state.holding && state.reorg === "orphaned") {
      state.tampered += 1;
      return { ...result, parentHash: ORPHAN_PARENT_HASH };
    }
    if (above > state.deepestReadAbove) state.deepestReadAbove = above;
    return result;
  }

  return result;
}
