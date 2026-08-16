/**
 * A read-only fake chain assembled from a recorded run.
 *
 * The dApp reads the chain almost entirely through Multicall3: of the 227
 * `eth_call`s in the committed peg-in recording, 226 are `aggregate3`
 * batches. Replaying those batches by matching the outer `data` byte-for-byte
 * would be useless in practice - the batch is composed by wagmi from whatever
 * hooks happen to be mounted, so adding one component to a page changes the
 * bytes and every recorded batch stops matching at once.
 *
 * So a batch is taken apart instead. Each recorded `aggregate3` is decoded
 * into its inner calls, paired positionally with the decoded results, and
 * stored per inner call. A live batch is answered the same way: decoded,
 * answered call by call, re-encoded. The recording's 609 inner calls collapse
 * to 35 distinct (target, selector) pairs, and a page that batches them
 * differently - or in a different order, or across two batches - is still
 * answered correctly.
 *
 * Lookup is exact-first: a call is answered by its full calldata when that
 * exact calldata was recorded, and otherwise by (target, selector) alone.
 * The fallback is what makes the fixture survive an argument the recording
 * never saw (a different block number, a re-ordered address array); the exact
 * tier is what keeps two calls to the same getter with different arguments
 * from collapsing into one answer.
 */

import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionResult,
  parseAbi,
  type Hex,
} from "viem";

import { parseJson, type RecordedRun } from "./recording";
import { buildSupplements } from "./supplements";

/** Canonical Multicall3 deployment address, identical on every chain. */
export const MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";

/**
 * Only `aggregate3` is modelled. It is what viem's batch scheduler emits and
 * what the recording contains; a batch arriving as `aggregate` or
 * `tryAggregate` is reported as unanswerable rather than guessed at, because
 * those have different result encodings and a wrong guess would decode into
 * plausible nonsense.
 */
const MULTICALL3_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

/** A JSON-RPC request body, as the dApp sends it. */
export interface JsonRpcRequest {
  readonly id?: number | string | null;
  readonly method?: string;
  readonly params?: readonly unknown[];
}

interface JsonRpcResponse {
  readonly result?: unknown;
}

/** An `eth_call` request object. */
interface EthCallParams {
  readonly to?: string;
  readonly data?: Hex;
}

/** A call the recording cannot answer, named for the failure message. */
export interface UnansweredCall {
  readonly target: string;
  readonly selector: string;
}

export interface RecordedChain {
  /**
   * Answer one `eth_call`. Returns the recorded return data, or null when
   * neither the exact calldata nor the (target, selector) pair was recorded.
   */
  answerCall(to: string, data: Hex): Hex | null;
  /**
   * Answer a whole `aggregate3` batch. Inner calls with no recorded answer
   * come back as `success: false`, and are also appended to
   * {@link RecordedChain.unanswered} so a test can fail on them - returning
   * a fabricated success would put invented numbers on screen.
   *
   * Returns null for a batch that is not `aggregate3` at all, which is
   * likewise recorded in {@link RecordedChain.unanswered}: throwing here would
   * escape the route handler, leave the request unfulfilled, and log no miss -
   * a silent green rather than the loud failure this fixture exists to give.
   */
  answerMulticall(data: Hex): Hex | null;
  /** Answer a non-`eth_call` method (`eth_chainId`, `eth_blockNumber`, ...). */
  answerMethod(method: string): unknown | undefined;
  /** Every call this chain could not answer, in the order they arrived. */
  readonly unanswered: readonly UnansweredCall[];
  /** How many distinct inner calls the recording yielded. */
  readonly size: number;
}

function selectorOf(data: Hex): string {
  return data.slice(0, 10).toLowerCase();
}

function exactKey(target: string, data: Hex): string {
  return `${target.toLowerCase()}|${data.toLowerCase()}`;
}

function selectorKey(target: string, data: Hex): string {
  return `${target.toLowerCase()}|${selectorOf(data)}`;
}

interface ChainTables {
  readonly exact: Map<string, Hex>;
  readonly bySelector: Map<string, Hex>;
  readonly methods: Map<string, unknown>;
}

/**
 * Decoded tables per run, so the ~226 recorded batches are taken apart once
 * rather than once per captured screen. Keyed on the run object, which
 * `loadRecordedRun` already caches per path.
 */
const tableCache = new WeakMap<RecordedRun, ChainTables>();

/**
 * Index every `eth_call` in the run - both the direct ones and the inner
 * calls of each recorded `aggregate3` - plus one representative response per
 * non-call JSON-RPC method.
 *
 * Later recordings of the same key overwrite earlier ones. That is
 * deliberate: the run progresses through a deposit, so the last recorded
 * value for a getter is the one describing the furthest-along state, which is
 * the state a screenshot of a populated app should show.
 */
function buildTables(run: RecordedRun): ChainTables {
  const exact = new Map<string, Hex>();
  const bySelector = new Map<string, Hex>();
  const methods = new Map<string, unknown>();

  const remember = (target: string, callData: Hex, returnData: Hex): void => {
    exact.set(exactKey(target, callData), returnData);
    bySelector.set(selectorKey(target, callData), returnData);
  };

  for (const entry of run.byBackend.get("eth-rpc") ?? []) {
    const request = parseJson<JsonRpcRequest>(entry.reqBody);
    const response = parseJson<JsonRpcResponse>(entry.resBody);
    if (!request?.method) continue;
    const result = response?.result;

    if (request.method !== "eth_call") {
      if (result !== undefined) methods.set(request.method, result);
      continue;
    }
    if (typeof result !== "string") continue;

    const [call] = (request.params ?? []) as [EthCallParams | undefined];
    const to = call?.to;
    const data = call?.data;
    if (typeof to !== "string" || typeof data !== "string") continue;

    if (to.toLowerCase() !== MULTICALL3_ADDRESS) {
      remember(to, data as Hex, result as Hex);
      continue;
    }

    let calls: readonly { target: string; callData: Hex }[];
    let results: readonly { success: boolean; returnData: Hex }[];
    try {
      [calls] = decodeFunctionData({ abi: MULTICALL3_ABI, data: data as Hex })
        .args as unknown as [{ target: string; callData: Hex }[]];
      results = decodeFunctionResult({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        data: result as Hex,
      }) as unknown as { success: boolean; returnData: Hex }[];
    } catch {
      // A batch this fixture cannot take apart carries no information it can
      // replay, and is not worth failing the load over - the inner calls it
      // holds are almost certainly recorded by another batch too.
      continue;
    }

    calls.forEach((inner, index) => {
      const outcome = results[index];
      if (!outcome?.success) return;
      remember(inner.target, inner.callData, outcome.returnData);
    });
  }

  // Applied last but never over a recorded answer: a supplement stands in for
  // a read the recording predates, so the moment the recording does hold one,
  // the recorded value is the truth and the supplement is dead weight.
  for (const supplement of buildSupplements(run)) {
    const key = exactKey(supplement.target, supplement.callData);
    if (exact.has(key)) continue;
    remember(supplement.target, supplement.callData, supplement.returnData);
  }

  return { exact, bySelector, methods };
}

/**
 * A chain view over a run.
 *
 * The decoded tables are shared across every call for the same run; only
 * {@link RecordedChain.unanswered} is per-view, so one screen's misses are
 * never attributed to another's.
 */
export function buildRecordedChain(run: RecordedRun): RecordedChain {
  let tables = tableCache.get(run);
  if (!tables) {
    tables = buildTables(run);
    tableCache.set(run, tables);
  }
  const { exact, bySelector, methods } = tables;
  const unanswered: UnansweredCall[] = [];

  const answerCall = (to: string, data: Hex): Hex | null =>
    exact.get(exactKey(to, data)) ??
    bySelector.get(selectorKey(to, data)) ??
    null;

  return {
    answerCall,
    answerMulticall(data: Hex): Hex | null {
      let calls: readonly { target: string; callData: Hex }[];
      try {
        [calls] = decodeFunctionData({
          abi: MULTICALL3_ABI,
          data,
        }).args as unknown as [{ target: string; callData: Hex }[]];
      } catch {
        // `aggregate`, `tryAggregate`, or calldata this fixture cannot take
        // apart. Reported like any other unanswerable call so the gate names
        // it, rather than thrown past the route handler.
        unanswered.push({
          target: MULTICALL3_ADDRESS,
          selector: selectorOf(data),
        });
        return null;
      }

      const results = calls.map((inner) => {
        const returnData = answerCall(inner.target, inner.callData);
        if (returnData === null) {
          unanswered.push({
            target: inner.target.toLowerCase(),
            selector: selectorOf(inner.callData),
          });
          return { success: false, returnData: "0x" as Hex };
        }
        return { success: true, returnData };
      });

      return encodeFunctionResult({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        result: results as never,
      });
    },
    answerMethod: (method) => methods.get(method),
    unanswered,
    get size() {
      return exact.size;
    },
  };
}
