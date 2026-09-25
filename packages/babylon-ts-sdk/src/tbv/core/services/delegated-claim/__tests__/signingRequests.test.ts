import { describe, expect, it } from "vitest";

import { buildDelegatedClaimSigningRequests } from "../signingRequests";

describe("buildDelegatedClaimSigningRequests", () => {
  it("orders claim, assert, claimer payout, depositor payout, then WronglyChallenged by challenger and GC index", () => {
    const requests = buildDelegatedClaimSigningRequests({
      claim: "c",
      assert: "a",
      payoutClaimer: "pc",
      payoutDepositor: "pd",
      wronglyChallenged: {
        ["aa".repeat(32)]: ["w0", "w1"],
        ["bb".repeat(32)]: ["x0"],
      },
    });

    expect(requests.map((r) => r.id)).toEqual([
      "claim",
      "assert",
      "payoutClaimer",
      "payoutDepositor",
      `wronglyChallenged:${"aa".repeat(32)}:0`,
      `wronglyChallenged:${"aa".repeat(32)}:1`,
      `wronglyChallenged:${"bb".repeat(32)}:0`,
    ]);
    // The claimer Payout signs its Assert connector at input 1; everything
    // else signs input 0. A wrong index yields a signature for the wrong
    // sighash that only surfaces at claim time.
    expect(requests.map((r) => r.inputIndex)).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  it("builds a WronglyChallenged request with only an id, kind, psbt and input index", () => {
    const requests = buildDelegatedClaimSigningRequests({
      claim: "c",
      assert: "a",
      payoutClaimer: "pc",
      payoutDepositor: "pd",
      wronglyChallenged: {
        ["aa".repeat(32)]: ["w0", "w1"],
        ["bb".repeat(32)]: ["x0"],
      },
    });

    expect(requests[4]).toStrictEqual({
      id: `wronglyChallenged:${"aa".repeat(32)}:0`,
      kind: "wronglyChallenged",
      psbtBase64: "w0",
      inputIndex: 0,
    });
  });
});
