import { describe, expect, it } from "vitest";

import {
  ClaimerPegoutStatusValue,
  isPegoutTerminalStatus,
  isRecognizedPegoutStatus,
} from "../state";

describe("pegout state", () => {
  describe("ClaimerPegoutStatusValue", () => {
    it("contains all expected enum values", () => {
      expect(ClaimerPegoutStatusValue.CLAIM_EVENT_RECEIVED).toBe(
        "ClaimEventReceived",
      );
      expect(ClaimerPegoutStatusValue.CLAIM_BROADCAST).toBe("ClaimBroadcast");
      expect(ClaimerPegoutStatusValue.ASSERT_BROADCAST).toBe("AssertBroadcast");
      expect(ClaimerPegoutStatusValue.CHALLENGE_ASSERT_OBSERVED).toBe(
        "ChallengeAssertObserved",
      );
      expect(ClaimerPegoutStatusValue.WRONGLY_CHALLENGED_BROADCAST).toBe(
        "WronglyChallengedBroadcast",
      );
      expect(ClaimerPegoutStatusValue.PAYOUT_BROADCAST).toBe(
        "PayoutBroadcast",
      );
      expect(ClaimerPegoutStatusValue.FAILED).toBe("Failed");
    });
  });

  describe("isRecognizedPegoutStatus", () => {
    it("returns true for all known claimer statuses", () => {
      expect(isRecognizedPegoutStatus("ClaimEventReceived")).toBe(true);
      expect(isRecognizedPegoutStatus("ClaimBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("AssertBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("ChallengeAssertObserved")).toBe(true);
      expect(isRecognizedPegoutStatus("WronglyChallengedBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("PayoutBroadcast")).toBe(true);
      expect(isRecognizedPegoutStatus("Failed")).toBe(true);
    });

    it("returns false for unrecognized statuses", () => {
      expect(isRecognizedPegoutStatus("SomeNewStatus")).toBe(false);
      expect(isRecognizedPegoutStatus("")).toBe(false);
      expect(isRecognizedPegoutStatus("FAILED")).toBe(false);
    });

    it("returns false for Object.prototype keys", () => {
      expect(isRecognizedPegoutStatus("constructor")).toBe(false);
      expect(isRecognizedPegoutStatus("toString")).toBe(false);
    });
  });

  describe("isPegoutTerminalStatus", () => {
    it("returns true for PayoutBroadcast", () => {
      expect(isPegoutTerminalStatus("PayoutBroadcast")).toBe(true);
    });

    it("returns true for Failed", () => {
      expect(isPegoutTerminalStatus("Failed")).toBe(true);
    });

    it("returns false for in-progress statuses", () => {
      expect(isPegoutTerminalStatus("ClaimBroadcast")).toBe(false);
      expect(isPegoutTerminalStatus("AssertBroadcast")).toBe(false);
      expect(isPegoutTerminalStatus("ClaimEventReceived")).toBe(false);
    });

    it("returns false for undefined status", () => {
      expect(isPegoutTerminalStatus(undefined)).toBe(false);
    });

    it("returns false for unrecognized statuses", () => {
      expect(isPegoutTerminalStatus("SomeNewStatus")).toBe(false);
    });
  });
});
