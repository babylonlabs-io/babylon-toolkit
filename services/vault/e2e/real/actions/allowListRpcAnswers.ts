/**
 * The app's depositor allow-list reads, taken apart from its own RPC traffic (see allowList.ts, which
 * watches the deposit form's, and positionCapacityRpc.ts, which also answers the deposit flow's). Kept
 * free of Playwright and the network profile so it can be unit-tested on its own.
 *
 * The app asks `AllowListPolicy.checkAllowed(applicationEntryPoint, depositor)` — from the deposit form,
 * and again from the deposit flow before its first signing prompt and before each registration attempt.
 * Its public client folds every read into a Multicall3 `aggregate3` batch, so the call usually arrives as
 * an inner call of one. Reads are matched by selector, not by target: the policy's address is something
 * the app resolves from the registry, and the e2e has no reason to trust or repeat that.
 */
import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionResult,
  multicall3Abi,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from "viem";

import { isRecord } from "./writeRpcAnswers";

export const CHECK_ALLOWED_ABI = parseAbi([
  "function checkAllowed(address appEntryPoint, address depositor) view returns (bool)",
]);
export const CHECK_ALLOWED_SELECTOR = toFunctionSelector(CHECK_ALLOWED_ABI[0]);

/** One `checkAllowed` call: who asked about whom. All lowercased. */
export interface CheckAllowedCall {
  policy: string;
  appEntryPoint: string;
  depositor: string;
}

/** One `checkAllowed` read the app made, with what the RPC answered. */
export interface AllowListRead extends CheckAllowedCall {
  /** null when the inner call failed or its answer could not be decoded. */
  answer: boolean | null;
}

/** A Multicall3 inner-call outcome. */
export interface CallOutcome {
  success: boolean;
  returnData: Hex;
}

/** Cheap pre-filter on a raw request body: can it carry a `checkAllowed` call at all? */
export function mayCarryCheckAllowed(body: string): boolean {
  return body.toLowerCase().includes(CHECK_ALLOWED_SELECTOR.slice(2));
}

/** The `checkAllowed` call `callData` makes on `target`, or null when it is another call. */
export function decodeCheckAllowedCall(
  target: string,
  callData: Hex,
): CheckAllowedCall | null {
  if (callData.slice(0, 10).toLowerCase() !== CHECK_ALLOWED_SELECTOR)
    return null;
  try {
    const {
      args: [appEntryPoint, depositor],
    } = decodeFunctionData({ abi: CHECK_ALLOWED_ABI, data: callData });
    return {
      policy: target.toLowerCase(),
      appEntryPoint: appEntryPoint.toLowerCase(),
      depositor: depositor.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/** What a `checkAllowed` outcome says, or null when the call failed or the bytes are not a bool. */
export function decodeCheckAllowedAnswer(outcome: CallOutcome): boolean | null {
  if (!outcome.success) return null;
  try {
    return decodeFunctionResult({
      abi: CHECK_ALLOWED_ABI,
      functionName: "checkAllowed",
      data: outcome.returnData,
    });
  } catch {
    return null;
  }
}

/** The outcome that tells the app "not on the list". */
export function notAllowListedOutcome(): CallOutcome {
  return {
    success: true,
    returnData: encodeFunctionResult({
      abi: CHECK_ALLOWED_ABI,
      functionName: "checkAllowed",
      result: false,
    }),
  };
}

/** What the app heard about one account in one application, split by whether the RPC answered. */
export interface AppAllowListAnswers {
  answered: AllowListRead[];
  /** Reads whose inner call failed or did not decode: the app got no answer, and fails open on it. */
  unanswered: AllowListRead[];
}

/** The app's reads about `depositor` in `appEntryPoint`, split by whether the RPC answered. */
export function appAllowListAnswers(
  reads: readonly AllowListRead[],
  appEntryPoint: string,
  depositor: string,
): AppAllowListAnswers {
  const ours = reads.filter(
    (read) =>
      read.appEntryPoint === appEntryPoint.toLowerCase() &&
      read.depositor === depositor.toLowerCase(),
  );
  return {
    answered: ours.filter((read) => read.answer !== null),
    unanswered: ours.filter((read) => read.answer === null),
  };
}

/**
 * The app must have heard the chain's answer about this account: every read sent to the registry's
 * policy, at least one of them answered, and every answered one equal to `allowed`. An unanswered read
 * is not a wrong answer — the app fails open on it, which its CTA shows — so it is only counted.
 */
export function assertAppHeardChain(
  reads: readonly AllowListRead[],
  expected: CheckAllowedCall & { allowed: boolean },
): AppAllowListAnswers {
  const heard = appAllowListAnswers(
    reads,
    expected.appEntryPoint,
    expected.depositor,
  );
  const asked = `checkAllowed(${expected.appEntryPoint}, ${expected.depositor})`;
  const elsewhere = [...heard.answered, ...heard.unanswered].find(
    (read) => read.policy !== expected.policy.toLowerCase(),
  );
  if (elsewhere)
    throw new Error(
      `The app asked a different allow-list policy (${elsewhere.policy}) than the registry names (${expected.policy}).`,
    );
  if (heard.answered.length === 0)
    throw new Error(
      heard.unanswered.length > 0
        ? `The app asked ${asked} ${heard.unanswered.length} time(s) but its RPC never answered, so the form's CTA was not decided by the allow-list.`
        : `No ${asked} read was recorded: either the app never asked on its RPC, or the RPC refused every such read outright, which leaves no answer to record. Either way the form's CTA was not decided by the allow-list (${reads.length} other checkAllowed read(s)).`,
    );
  const mismatch = heard.answered.find(
    (read) => read.answer !== expected.allowed,
  );
  if (mismatch)
    throw new Error(
      `The app's ${asked} read was answered ${String(mismatch.answer)}, but the chain says ${String(expected.allowed)}.`,
    );
  return heard;
}

/**
 * Every `checkAllowed` read in one `eth_call` and its `result`: a lone call, or the inner calls of a
 * Multicall3 batch sent to `multicall3`. A batch that cannot be taken apart yields nothing.
 */
export function readAllowListAnswers(
  call: unknown,
  result: Hex,
  multicall3: string,
): AllowListRead[] {
  if (!isRecord(call) || typeof call.to !== "string") return [];
  const data = (call.data ?? call.input) as Hex | undefined;
  if (typeof data !== "string") return [];

  if (call.to.toLowerCase() !== multicall3.toLowerCase()) {
    const asked = decodeCheckAllowedCall(call.to, data);
    return asked
      ? [
          {
            ...asked,
            answer: decodeCheckAllowedAnswer({
              success: true,
              returnData: result,
            }),
          },
        ]
      : [];
  }

  let calls: readonly { target: string; callData: Hex }[];
  let outcomes: readonly CallOutcome[];
  try {
    [calls] = decodeFunctionData({ abi: multicall3Abi, data })
      .args as unknown as [{ target: string; callData: Hex }[]];
    outcomes = decodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      data: result,
    }) as unknown as CallOutcome[];
  } catch {
    return [];
  }
  if (outcomes.length !== calls.length) return [];

  return calls.flatMap((inner, index) => {
    const asked = decodeCheckAllowedCall(inner.target, inner.callData);
    return asked
      ? [{ ...asked, answer: decodeCheckAllowedAnswer(outcomes[index]) }]
      : [];
  });
}
