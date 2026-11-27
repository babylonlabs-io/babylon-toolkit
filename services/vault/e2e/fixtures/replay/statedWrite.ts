/**
 * The wallet's node for one write, stated by the spec that walks it.
 *
 * The recorded backend is read-only: the recording holds no transaction, so a
 * spec that sends one has to say what the chain does with it. This answers
 * the JSON-RPC methods a write touches - the send, the account's transaction
 * count, the transaction, its receipt and the blocks above it - from a small
 * state machine, and leaves every other request to the replay.
 *
 * Nothing is signed. The injected ETH wallet forwards `eth_sendTransaction`
 * to the replayed endpoint like any read (see `../pageWallets.ts`), and this
 * answers it the way a node answers a wallet that broadcast the transaction:
 * with its hash. A send this module accepts is mined, and buried deep enough
 * for the app to report it, in the same step, so the app's depth check and
 * its wait for the wallet to count the transaction both pass on their first
 * read.
 *
 * A request this write should never see - a second send, a receipt before
 * the send, a block above the head, another account's count - is a miss, not
 * a guess. The replay records it with its own misses, so
 * `assertRecordingCovered` names it.
 */

import { numberToHex, pad, toHex, type Address, type Hex } from "viem";

/** How the stated write ends. */
export type StatedWriteOutcome =
  /** Mined, and succeeded. */
  | { readonly kind: "succeeds" }
  /**
   * Mined, and reverted. The app replays the call at the receipt's block to
   * name the revert; that replay reverts with `revertData`.
   */
  | { readonly kind: "reverts"; readonly revertData: Hex }
  /**
   * The wallet's node refuses the send as "nonce too low" without naming a
   * nonce, so the app cannot prove it was never broadcast.
   */
  | { readonly kind: "refusedAsNonceTooLow" };

/** One answer, in the shape the replay sends back. */
export type StatedWriteAnswer =
  | { readonly result: unknown }
  | {
      readonly error: {
        readonly code: number;
        readonly message: string;
        readonly data?: Hex;
      };
    }
  /** A request this write should never see, named for the coverage gate. */
  | { readonly miss: string };

export interface StatedWrite {
  /**
   * The answer to one JSON-RPC request, or `undefined` when it is not this
   * write's to answer, so the replay answers it.
   */
  answer(
    method: string,
    params: readonly unknown[],
  ): StatedWriteAnswer | undefined;
  /**
   * The calldata of every send from `account` to `target`, in order,
   * accepted or refused. A send from or to anywhere else is a miss and is
   * not recorded here.
   */
  readonly sends: readonly Hex[];
}

/**
 * The chain head before the send. Any head will do: the replay answers a
 * contract read the same at any block.
 */
const HEAD_BEFORE_SEND = 1_000n;

/**
 * Blocks mined on top of the write's own block when it is mined.
 *
 * KEEP IN SYNC with `AAVE_WRITE_CONFIRMATIONS` (3) in
 * `src/applications/aave/constants.ts`: the app reports an Aave write once it
 * is that many blocks deep, its own block included. With these two blocks it
 * is that deep at once, so the depth check passes on its first poll, which is
 * immediate, instead of polling every 6 s. Too few and it reads a block above
 * the head, which is a miss.
 */
const BLOCKS_MINED_ON_TOP = 2n;

/**
 * The account's transaction count before the send. Any count will do; the
 * same at `latest` and `pending`, so no transaction is in flight.
 */
const COUNT_BEFORE_SEND = 7;

/** The hash the node answers the send with. */
const SENT_HASH: Hex = `0x${"5e".repeat(32)}`;

/**
 * The write's gas limit, and the gas it used: half the limit. The app reads a
 * revert that used 95% of the limit or more as out of gas
 * (`src/clients/eth-contract/transactionFactory.ts`), which would hide the
 * revert this fixture states.
 */
const GAS_LIMIT = 200_000n;
const GAS_USED = 100_000n;

/** JSON-RPC error code geth answers a reverted `eth_call` with. */
const JSON_RPC_EXECUTION_REVERTED = 3;
/**
 * JSON-RPC error code geth answers a refused transaction with. The injected
 * wallet (`../pageWallets.ts`) passes the node's message on but not its code,
 * so the app sees a refusal with no code, as from a wallet that does not
 * forward node error codes, and viem's `-32000` re-send as
 * `wallet_sendTransaction` never starts here. The real-wallet runner covers
 * that path on a borrow (`--inject-nonce-too-low=already-sent-fallback`).
 */
const JSON_RPC_INVALID_INPUT = -32000;
/**
 * The refusal of a node that names no nonce. The app can prove the refused
 * transaction was never broadcast only from a named nonce
 * (`src/utils/errors/rejectedNonce.ts`).
 */
const NONCE_TOO_LOW_MESSAGE = "nonce too low";

/** Block `n`'s hash: `n` itself, so a hash names its block. */
function blockHash(n: bigint): Hex {
  return pad(numberToHex(n), { size: 32 });
}

/** A hex quantity, such as a block number. */
const HEX_QUANTITY = /^0x[0-9a-f]+$/i;
/** A 32-byte hash. */
const HASH_32 = /^0x[0-9a-f]{64}$/i;

function block(n: bigint) {
  return {
    number: toHex(n),
    hash: blockHash(n),
    parentHash: blockHash(n - 1n),
    transactions: [],
  };
}

function isSame(a: unknown, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

/** The fields of a JSON-RPC transaction request this module reads. */
interface TransactionRequest {
  readonly from?: string;
  readonly to?: string;
  readonly data?: Hex;
}

/**
 * The node behind one write from `account` to `target`, ending as `outcome`.
 */
export function statedWrite({
  account,
  target,
  outcome,
}: {
  account: Address;
  target: Address;
  outcome: StatedWriteOutcome;
}): StatedWrite {
  const sends: Hex[] = [];
  let head = HEAD_BEFORE_SEND;
  let count = COUNT_BEFORE_SEND;
  let mined: { data: Hex; block: bigint } | null = null;

  const transaction = (write: NonNullable<typeof mined>) => ({
    type: "0x2",
    hash: SENT_HASH,
    nonce: toHex(COUNT_BEFORE_SEND),
    from: account,
    to: target,
    input: write.data,
    value: "0x0",
    gas: toHex(GAS_LIMIT),
    accessList: [],
    blockHash: blockHash(write.block),
    blockNumber: toHex(write.block),
    transactionIndex: "0x0",
  });

  const receipt = (write: NonNullable<typeof mined>) => ({
    type: "0x2",
    status: outcome.kind === "reverts" ? "0x0" : "0x1",
    transactionHash: SENT_HASH,
    transactionIndex: "0x0",
    blockHash: blockHash(write.block),
    blockNumber: toHex(write.block),
    from: account,
    to: target,
    gasUsed: toHex(GAS_USED),
    cumulativeGasUsed: toHex(GAS_USED),
    // The app looks for a Safe's execution log in it.
    logs: [],
    contractAddress: null,
  });

  const blockAt = (n: bigint): StatedWriteAnswer =>
    n > head ? { miss: `block ${n} above head ${head}` } : { result: block(n) };

  const send = (request: TransactionRequest | undefined): StatedWriteAnswer => {
    const data = request?.data;
    if (
      !isSame(request?.from, account) ||
      !isSame(request?.to, target) ||
      data === undefined
    ) {
      return {
        miss: `a send from ${request?.from} to ${request?.to}, not ${account} to ${target}`,
      };
    }
    sends.push(data);
    if (sends.length > 1) return { miss: "a second send" };
    if (outcome.kind === "refusedAsNonceTooLow") {
      return {
        error: { code: JSON_RPC_INVALID_INPUT, message: NONCE_TOO_LOW_MESSAGE },
      };
    }
    mined = { data, block: head + 1n };
    head = mined.block + BLOCKS_MINED_ON_TOP;
    count += 1;
    return { result: SENT_HASH };
  };

  // The account's own call to the target: the app's pre-flight simulation
  // before the send, and, for a revert, its replay of the call at the
  // receipt's block. Only those two carry `from`, and viem never batches a
  // call that does, so neither reaches the replay inside a multicall.
  const callFromAccount = (blockTag: unknown): StatedWriteAnswer => {
    if (mined === null && blockTag === "latest") return { result: "0x" };
    if (
      mined !== null &&
      outcome.kind === "reverts" &&
      blockTag === toHex(mined.block)
    ) {
      return {
        error: {
          code: JSON_RPC_EXECUTION_REVERTED,
          message: "execution reverted",
          data: outcome.revertData,
        },
      };
    }
    return { miss: `the account's call to ${target} at ${String(blockTag)}` };
  };

  return {
    sends,
    answer(method, params) {
      switch (method) {
        case "eth_blockNumber":
          return { result: toHex(head) };
        case "eth_getTransactionCount": {
          const [address, blockTag] = params;
          if (!isSame(address, account)) {
            return { miss: `transaction count of ${String(address)}` };
          }
          if (blockTag !== "latest" && blockTag !== "pending") {
            return { miss: `transaction count at ${String(blockTag)}` };
          }
          return { result: toHex(count) };
        }
        case "eth_getCode": {
          const [address] = params;
          // An account with no code: an ordinary wallet, not a Safe.
          if (isSame(address, account)) return { result: "0x" };
          return { miss: `code of ${String(address)}` };
        }
        case "eth_call": {
          const [request, blockTag] = params as [
            TransactionRequest | undefined,
            unknown,
          ];
          if (!isSame(request?.from, account) || !isSame(request?.to, target)) {
            return undefined;
          }
          return callFromAccount(blockTag);
        }
        case "eth_sendTransaction":
          return send(params[0] as TransactionRequest | undefined);
        case "eth_getTransactionByHash":
        case "eth_getTransactionReceipt": {
          const [hash] = params;
          if (!isSame(hash, SENT_HASH) || mined === null) {
            return {
              miss: `${method} for ${String(hash)} before it was mined`,
            };
          }
          return {
            result:
              method === "eth_getTransactionByHash"
                ? transaction(mined)
                : receipt(mined),
          };
        }
        case "eth_getBlockByNumber": {
          const [blockTag] = params;
          if (blockTag === "latest") return { result: block(head) };
          if (typeof blockTag !== "string" || !HEX_QUANTITY.test(blockTag)) {
            return { miss: `block ${String(blockTag)}` };
          }
          return blockAt(BigInt(blockTag));
        }
        case "eth_getBlockByHash": {
          const [hash] = params;
          if (typeof hash !== "string" || !HASH_32.test(hash)) {
            return { miss: `block by hash ${String(hash)}` };
          }
          // Every 32-byte hash names the block whose number it is (see
          // `blockHash`), so one above the head is the only kind to refuse.
          return blockAt(BigInt(hash));
        }
        default:
          return undefined;
      }
    },
  };
}
