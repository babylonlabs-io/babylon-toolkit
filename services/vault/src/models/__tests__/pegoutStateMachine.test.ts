import { describe, expect, it } from "vitest";

import { isPegoutClaimBroadcast } from "../pegoutStateMachine";

describe("isPegoutClaimBroadcast", () => {
  it("is false before the claim is broadcast", () => {
    expect(isPegoutClaimBroadcast(undefined)).toBe(false);
    expect(isPegoutClaimBroadcast("ClaimEventReceived")).toBe(false);
  });

  it("is true from the claim broadcast through every later status", () => {
    expect(isPegoutClaimBroadcast("ClaimBroadcast")).toBe(true);
    expect(isPegoutClaimBroadcast("AssertBroadcast")).toBe(true);
    expect(isPegoutClaimBroadcast("PayoutConfirmed")).toBe(true);
    expect(isPegoutClaimBroadcast("PayoutBlocked")).toBe(true);
  });

  it("is false for a status it does not recognize", () => {
    expect(isPegoutClaimBroadcast("SomeNewStatus")).toBe(false);
    expect(isPegoutClaimBroadcast("")).toBe(false);
  });
});
