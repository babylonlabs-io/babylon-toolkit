import {
  encodeFunctionData,
  encodeFunctionResult,
  multicall3Abi,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";

import {
  assertAppHeardChain,
  CHECK_ALLOWED_ABI,
  decodeCheckAllowedAnswer,
  mayCarryCheckAllowed,
  notAllowListedOutcome,
  readAllowListAnswers,
  type AllowListRead,
} from "../allowListRpcAnswers";

const DEPOSITOR = "0xb5761b53db0e9524be89dd2045664fba9d16edfa";
const ADAPTER = "0x6a785e8fdf251e2aa758a6e1841e1470074f46bf";
const POLICY = "0x02a49a92b93fbc60321df5b9dde7c9f8189b2e39";
const PRICE_FEED = "0xa5c0000000000000000000000000000000000003";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const UNRELATED_CALL: Hex = "0xfeaf968c";
const UNRELATED_RESULT: Hex = `0x${"00".repeat(31)}2a`;

const ASK_ALLOWED: Hex = encodeFunctionData({
  abi: CHECK_ALLOWED_ABI,
  functionName: "checkAllowed",
  args: [ADAPTER, DEPOSITOR],
});

function allowedAnswer(allowed: boolean): Hex {
  return encodeFunctionResult({
    abi: CHECK_ALLOWED_ABI,
    functionName: "checkAllowed",
    result: allowed,
  });
}

/** An `eth_call` to Multicall3 carrying `calls`, and the RPC's `aggregate3` result for `outcomes`. */
function batch(
  calls: readonly { target: string; callData: Hex }[],
  outcomes: readonly { success: boolean; returnData: Hex }[],
): { call: { to: string; data: Hex }; result: Hex } {
  return {
    call: {
      to: MULTICALL3,
      data: encodeFunctionData({
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [
          calls.map((inner) => ({
            target: inner.target as Hex,
            allowFailure: true,
            callData: inner.callData,
          })),
        ],
      }),
    },
    result: encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: outcomes,
    }),
  };
}

describe("readAllowListAnswers", () => {
  it("reads the depositor's checkAllowed answer out of a Multicall3 batch beside other calls", () => {
    const { call, result } = batch(
      [
        { target: PRICE_FEED, callData: UNRELATED_CALL },
        { target: POLICY, callData: ASK_ALLOWED },
      ],
      [
        { success: true, returnData: UNRELATED_RESULT },
        { success: true, returnData: allowedAnswer(false) },
      ],
    );

    expect(readAllowListAnswers(call, result, MULTICALL3)).toEqual([
      {
        policy: POLICY,
        appEntryPoint: ADAPTER,
        depositor: DEPOSITOR,
        answer: false,
      },
    ]);
  });

  it("reads a lone checkAllowed call sent straight to the policy", () => {
    const call = { to: POLICY, data: ASK_ALLOWED };

    expect(readAllowListAnswers(call, allowedAnswer(true), MULTICALL3)).toEqual(
      [
        {
          policy: POLICY,
          appEntryPoint: ADAPTER,
          depositor: DEPOSITOR,
          answer: true,
        },
      ],
    );
  });

  it("reports a failed inner call as having no answer", () => {
    const { call, result } = batch(
      [{ target: POLICY, callData: ASK_ALLOWED }],
      [{ success: false, returnData: "0x" }],
    );

    expect(readAllowListAnswers(call, result, MULTICALL3)).toEqual([
      expect.objectContaining({ answer: null }),
    ]);
  });

  it("finds nothing in a batch without a checkAllowed call", () => {
    const { call, result } = batch(
      [{ target: PRICE_FEED, callData: UNRELATED_CALL }],
      [{ success: true, returnData: UNRELATED_RESULT }],
    );

    expect(readAllowListAnswers(call, result, MULTICALL3)).toEqual([]);
  });

  it("finds nothing in a batch whose result does not decode", () => {
    const { call } = batch(
      [{ target: POLICY, callData: ASK_ALLOWED }],
      [{ success: true, returnData: allowedAnswer(true) }],
    );

    expect(readAllowListAnswers(call, "0xdeadbeef", MULTICALL3)).toEqual([]);
  });
});

describe("mayCarryCheckAllowed", () => {
  it("spots the checkAllowed selector inside a batched request body", () => {
    const { call } = batch(
      [{ target: POLICY, callData: ASK_ALLOWED }],
      [{ success: true, returnData: allowedAnswer(true) }],
    );

    expect(mayCarryCheckAllowed(JSON.stringify({ params: [call] }))).toBe(true);
    expect(mayCarryCheckAllowed(JSON.stringify({ params: [] }))).toBe(false);
  });
});

describe("notAllowListedOutcome", () => {
  it("encodes the policy's own 'not allowed' answer", () => {
    expect(decodeCheckAllowedAnswer(notAllowListedOutcome())).toBe(false);
  });
});

describe("assertAppHeardChain", () => {
  const OTHER_ACCOUNT = "0x00000000000000000000000000000000000000b2";
  const OTHER_POLICY = "0x00000000000000000000000000000000000000c3";
  const expected = {
    policy: POLICY,
    appEntryPoint: ADAPTER,
    depositor: DEPOSITOR,
    allowed: false,
  };

  function read(
    answer: boolean | null,
    overrides: Partial<AllowListRead> = {},
  ): AllowListRead {
    return {
      policy: POLICY,
      appEntryPoint: ADAPTER,
      depositor: DEPOSITOR,
      answer,
      ...overrides,
    };
  }

  it("passes a run where one read went unanswered beside the chain's answer, and counts it", () => {
    // The RPC answered the batch but the inner call failed: the app got no answer and fails open on
    // it, which is not the app being told the wrong thing.
    const heard = assertAppHeardChain([read(false), read(null)], expected);

    expect(heard.answered).toHaveLength(1);
    expect(heard.unanswered).toHaveLength(1);
  });

  it("fails when an answered read disagrees with the chain", () => {
    expect(() =>
      assertAppHeardChain([read(false), read(true)], expected),
    ).toThrow(/answered true, but the chain says false/);
  });

  it("fails when every read the app made went unanswered", () => {
    expect(() =>
      assertAppHeardChain([read(null), read(null)], expected),
    ).toThrow(/2 time\(s\) but its RPC never answered/);
  });

  it("fails when the app never asked about this account", () => {
    expect(() =>
      assertAppHeardChain(
        [read(false, { depositor: OTHER_ACCOUNT })],
        expected,
      ),
    ).toThrow(/never asked/);
  });

  it("fails when the app asked a policy the registry does not name", () => {
    expect(() =>
      assertAppHeardChain([read(false, { policy: OTHER_POLICY })], expected),
    ).toThrow(/different allow-list policy/);
  });
});
