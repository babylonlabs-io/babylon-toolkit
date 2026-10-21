/**
 * Watches a deposit's position-capacity checks on the app's own traffic and, with
 * `--inject-position-full`, answers the depositor's `allowedToDeposit` with `false` (what is recorded and
 * how it is judged lives in positionCapacityRpcAnswers.ts).
 *
 * It routes every request of the page and acts only on:
 *   - `eth_call`s that may carry a watched read: fetched, recorded, and rewritten while the injection
 *     holds;
 *   - `eth_estimateGas`: the first one for the depositor's call to the registry is the registration being
 *     prepared. With no capacity read since Sign an enforcing watch refuses it, so the registration fails
 *     before its MetaMask prompt and nothing is sent; a watch that does not enforce only logs it;
 *   - `eth_getTransactionReceipt`, until the registration is mined;
 *   - the Pre-PegIn broadcast, a `POST …/tx` to the mempool API (observed, never touched).
 * Every extension window that opens on the context counts as a wallet prompt.
 *
 * MetaMask reads and broadcasts through its own node, which the route never sees, so the registration and
 * the activation are still sent and mined for real.
 */
import type { BrowserContext, Page, Route } from "@playwright/test";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";

import { type PositionFullInjection } from "../config";

import { fulfillWithResult, parseJsonRpcCall } from "./jsonRpcRoute";
import {
  answerEthCall,
  createCapacityRpcState,
  describeRead,
  mayCarryWatchedCall,
  noteEstimateGas,
  noteReceipt,
  type CapacityRpcState,
} from "./positionCapacityRpcAnswers";
import { isRecord } from "./writeRpcAnswers";

/** The mempool API's broadcast endpoint (`pushTx`): a POST of the raw transaction hex to `…/tx`. */
const BROADCAST_PATH_RX = /\/tx$/;

export interface PositionCapacityWatch {
  state(): CapacityRpcState;
  /** Call right before clicking Sign: reads after this belong to the deposit. */
  markSignClick(): void;
  /** Call right before clicking Retry after a refusal. */
  markRetryClick(): void;
  /** Stop the injection: from now on the chain's real answers reach the app. */
  release(): void;
  /** Remove the route and the window listener. */
  dispose(): Promise<void>;
}

export async function watchPositionCapacity(
  page: Page,
  context: BrowserContext,
  params: {
    depositor: string;
    adapter: string;
    registry: string;
    injection: PositionFullInjection | undefined;
    /** Refuse a registration estimate that no capacity read preceded. */
    enforce: boolean;
    startBlock: bigint;
    log: (message: string) => void;
  },
): Promise<PositionCapacityWatch> {
  const { log } = params;
  const state = createCapacityRpcState({
    depositor: params.depositor,
    adapter: params.adapter,
    registry: params.registry,
    multicall3: sepolia.contracts.multicall3.address,
    injection: params.injection,
    startBlock: params.startBlock,
  });
  let seq = 0;
  const nextSeq = () => {
    seq += 1;
    return seq;
  };

  const matches = "**/*";
  const handler = async (route: Route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      BROADCAST_PATH_RX.test(new URL(request.url()).pathname)
    ) {
      state.broadcastSeqs.push(nextSeq());
      log("Position-capacity watch: the app is broadcasting the Pre-PegIn.");
      return route.fallback();
    }

    const call = parseJsonRpcCall(request);
    if (!call) return route.fallback();

    if (call.method === "eth_estimateGas") {
      if (noteEstimateGas(state, nextSeq(), call.params))
        return route.fallback();
      if (!params.enforce) {
        log(
          `⚠️ ${state.violation} Not enforced: the run drives a deployed build, which can predate the check.`,
        );
        return route.fallback();
      }
      log(
        `❌ ${state.violation} The registration estimate was refused, so nothing was sent.`,
      );
      return route.abort();
    }

    if (
      call.method === "eth_getTransactionReceipt" &&
      state.registrationMined === null
    ) {
      const response = await route.fetch().catch(() => null);
      if (!response) return route.abort();
      const body: unknown = await response.json().catch(() => null);
      const mined = isRecord(body)
        ? noteReceipt(state, nextSeq(), body.result)
        : null;
      if (mined)
        log(
          `Position-capacity watch: registration ${mined.txHash} mined in block ${mined.blockNumber}.`,
        );
      return route.fulfill({ response });
    }

    if (
      call.method !== "eth_call" ||
      !mayCarryWatchedCall(request.postData() ?? "")
    )
      return route.fallback();

    // Numbered on arrival: the read was asked before anything that arrives after it.
    const callSeq = nextSeq();
    const response = await route.fetch().catch(() => null);
    // The page gets the network error it would have had; a fallback would resend the call past the
    // watch, and viem's retry comes back through this route anyway.
    if (!response) return route.abort();
    const body: unknown = await response.json().catch(() => null);
    if (!isRecord(body) || typeof body.result !== "string")
      return route.fulfill({ response });

    const before = state.capacityReads.length;
    const result = answerEthCall(
      state,
      callSeq,
      call.params[0],
      body.result as Hex,
    );
    for (const read of state.capacityReads.slice(before))
      log(
        `Position-capacity watch: the app asked ${describeRead(read)} → chain ${read.realAnswer}, served ${read.servedAnswer}${read.servedAnswer !== read.realAnswer ? " (injected)" : ""}.`,
      );
    if (result === body.result) return route.fulfill({ response });
    return fulfillWithResult(route, response, body, result);
  };
  await page.route(matches, handler);

  const onWindow = (opened: Page) => {
    // Numbered when the window opens, not when it loads: the prompt exists from that moment.
    const windowSeq = nextSeq();
    void opened
      .waitForLoadState("domcontentloaded")
      .catch(() => {})
      .then(() => {
        const url = opened.url();
        if (!url.startsWith("chrome-extension://")) return;
        state.popups.push({ seq: windowSeq, url });
      });
  };
  context.on("page", onWindow);

  return {
    state: () => state,
    markSignClick() {
      state.signClickSeq = nextSeq();
    },
    markRetryClick() {
      state.retryClickSeq = nextSeq();
    },
    release() {
      state.holding = false;
      log("Position-capacity watch: injection released.");
    },
    async dispose() {
      context.off("page", onWindow);
      await page.unroute(matches, handler);
    },
  };
}
