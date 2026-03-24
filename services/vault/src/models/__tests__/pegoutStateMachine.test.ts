import { describe, expect, it } from "vitest";

import { getPegoutDisplayState } from "../pegoutStateMachine";

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

    it("returns Under Review for ChallengeAssertObserved", () => {
      const state = getPegoutDisplayState("ChallengeAssertObserved", true);
      expect(state.label).toBe("Under Review");
      expect(state.variant).toBe("warning");
    });

    it("returns Resuming for WronglyChallengedBroadcast", () => {
      const state = getPegoutDisplayState("WronglyChallengedBroadcast", true);
      expect(state.label).toBe("Resuming");
      expect(state.variant).toBe("pending");
    });

    it("returns BTC Sent for PayoutBroadcast", () => {
      const state = getPegoutDisplayState("PayoutBroadcast", true);
      expect(state.label).toBe("BTC Sent");
      expect(state.variant).toBe("active");
    });

    it("returns Failed for Failed status", () => {
      const state = getPegoutDisplayState("Failed", true);
      expect(state.label).toBe("Failed");
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
});
