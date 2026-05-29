import { describe, expect, it } from "vitest";

import {
  getPegoutDisplayState,
  getPegoutTxLinkFlags,
  isPegoutEffectivelyTerminal,
  isRecognizedPegoutStatus,
  TIMED_OUT_STATE,
} from "../pegoutStateMachine";

describe("pegoutStateMachine", () => {
  describe("getPegoutDisplayState", () => {
    it("returns Initiating when pegout is not found", () => {
      const state = getPegoutDisplayState(undefined, false);
      expect(state.label).toBe("Initiating");
      expect(state.variant).toBe("pending");
    });

    it("returns Initiating when found but claimerStatus is undefined", () => {
      const state = getPegoutDisplayState(undefined, true);
      expect(state.label).toBe("Initiating");
      expect(state.variant).toBe("pending");
    });

    it("returns Initiating when found but claimerStatus is empty string", () => {
      const state = getPegoutDisplayState("", true);
      expect(state.label).toBe("Initiating");
      expect(state.variant).toBe("pending");
    });

    it("returns Processing for ClaimEventReceived", () => {
      const state = getPegoutDisplayState("ClaimEventReceived", true);
      expect(state.label).toBe("Processing");
      expect(state.variant).toBe("pending");
    });

    it("returns Processing for ClaimBroadcast", () => {
      const state = getPegoutDisplayState("ClaimBroadcast", true);
      expect(state.label).toBe("Processing");
      expect(state.variant).toBe("pending");
    });

    it("returns Confirming for AssertBroadcast", () => {
      const state = getPegoutDisplayState("AssertBroadcast", true);
      expect(state.label).toBe("Confirming");
      expect(state.variant).toBe("pending");
    });

    it("describes the challenge period (not 'a few hours') for AssertBroadcast", () => {
      const state = getPegoutDisplayState("AssertBroadcast", true);
      expect(state.message.toLowerCase()).toContain("challenge period");
      expect(state.message.toLowerCase()).not.toContain("few hours");
    });

    it("returns BTC Sent for PayoutBroadcast", () => {
      const state = getPegoutDisplayState("PayoutBroadcast", true);
      expect(state.label).toBe("BTC Sent");
      expect(state.variant).toBe("active");
    });

    it("returns Blocked for PayoutBlocked status", () => {
      const state = getPegoutDisplayState("PayoutBlocked", true);
      expect(state.label).toBe("Blocked");
      expect(state.variant).toBe("warning");
    });

    it("returns Unknown with raw status for unrecognized claimerStatus", () => {
      const state = getPegoutDisplayState("SomeNewStatus", true);
      expect(state.label).toBe("Unknown");
      expect(state.variant).toBe("warning");
      expect(state.message).toBe(
        "Unknown status: SomeNewStatus. Please contact support.",
      );
    });

    it("includes raw status in Unknown message for corrupted values", () => {
      const state = getPegoutDisplayState("corrupted_value_123", true);
      expect(state.label).toBe("Unknown");
      expect(state.message).toContain("corrupted_value_123");
    });
  });

  describe("getPegoutTxLinkFlags", () => {
    it("links neither tx before the claim is broadcast", () => {
      expect(getPegoutTxLinkFlags(undefined)).toEqual({
        linkClaim: false,
        linkAssert: false,
      });
      expect(getPegoutTxLinkFlags("ClaimEventReceived")).toEqual({
        linkClaim: false,
        linkAssert: false,
      });
    });

    it("links only the claim once the claim is broadcast", () => {
      expect(getPegoutTxLinkFlags("ClaimBroadcast")).toEqual({
        linkClaim: true,
        linkAssert: false,
      });
    });

    it("links both once the assert is broadcast", () => {
      expect(getPegoutTxLinkFlags("AssertBroadcast")).toEqual({
        linkClaim: true,
        linkAssert: true,
      });
      expect(getPegoutTxLinkFlags("PayoutBroadcast")).toEqual({
        linkClaim: true,
        linkAssert: true,
      });
      expect(getPegoutTxLinkFlags("PayoutBlocked")).toEqual({
        linkClaim: true,
        linkAssert: true,
      });
    });
  });

  describe("isRecognizedPegoutStatus", () => {
    it("returns true for all known claimer statuses", () => {
      expect(isRecognizedPegoutStatus("ClaimEventReceived")).toBe(true);
      expect(isRecognizedPegoutStatus("ClaimBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("AssertBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("PayoutBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("PayoutBlocked")).toBe(true);
    });

    it("returns false for unrecognized statuses", () => {
      expect(isRecognizedPegoutStatus("SomeNewStatus")).toBe(false);
      expect(isRecognizedPegoutStatus("")).toBe(false);
      expect(isRecognizedPegoutStatus("Failed")).toBe(false);
    });

    it("returns false for Object.prototype keys", () => {
      expect(isRecognizedPegoutStatus("constructor")).toBe(false);
      expect(isRecognizedPegoutStatus("toString")).toBe(false);
    });
  });

  describe("isPegoutEffectivelyTerminal", () => {
    it("returns true for PayoutBroadcast", () => {
      expect(isPegoutEffectivelyTerminal("PayoutBroadcast", 0, 0)).toBe(true);
    });

    it("returns true for PayoutBlocked", () => {
      expect(isPegoutEffectivelyTerminal("PayoutBlocked", 0, 0)).toBe(true);
    });

    it("returns false for in-progress status with low counters", () => {
      expect(isPegoutEffectivelyTerminal("ClaimBroadcast", 0, 0)).toBe(false);
      expect(isPegoutEffectivelyTerminal("AssertBroadcast", 2, 3)).toBe(false);
    });

    it("returns false for undefined status with low counters", () => {
      expect(isPegoutEffectivelyTerminal(undefined, 0, 0)).toBe(false);
      expect(isPegoutEffectivelyTerminal(undefined, 5, 0)).toBe(false);
    });

    it("returns true when consecutive failures reach threshold", () => {
      expect(isPegoutEffectivelyTerminal(undefined, 10, 0)).toBe(true);
    });

    it("returns true when consecutive failures exceed threshold", () => {
      expect(isPegoutEffectivelyTerminal(undefined, 15, 0)).toBe(true);
    });

    it("returns true when consecutive unknown polls reach threshold", () => {
      expect(isPegoutEffectivelyTerminal("SomeNewStatus", 0, 20)).toBe(true);
    });

    it("returns true when consecutive unknown polls exceed threshold", () => {
      expect(isPegoutEffectivelyTerminal("SomeNewStatus", 0, 21)).toBe(true);
    });

    it("returns false when counters are just below thresholds", () => {
      expect(isPegoutEffectivelyTerminal("SomeNewStatus", 9, 19)).toBe(false);
    });
  });

  describe("TIMED_OUT_STATE", () => {
    it("has warning variant and Status Unavailable label", () => {
      expect(TIMED_OUT_STATE.label).toBe("Status Unavailable");
      expect(TIMED_OUT_STATE.variant).toBe("warning");
      expect(TIMED_OUT_STATE.message).toBeTruthy();
    });
  });
});
