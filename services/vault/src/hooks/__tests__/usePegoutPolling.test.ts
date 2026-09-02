import { describe, expect, it } from "vitest";

import {
  PEGOUT_MAX_UNKNOWN_STATUS_POLLS,
  TIMED_OUT_STATE,
} from "@/models/pegoutStateMachine";

import {
  applyPegoutNotIngested,
  type PegoutPollingResult,
} from "../usePegoutPolling";

describe("applyPegoutNotIngested", () => {
  it("keeps the vault pending and resets the failure counter", () => {
    const vaultId = "0xvault-1";
    const results = new Map<string, PegoutPollingResult>();
    const counters = {
      failureCounts: new Map([[vaultId, 3]]),
      unknownCounts: new Map<string, number>(),
    };

    applyPegoutNotIngested(vaultId, results, counters);

    expect(counters.failureCounts.get(vaultId)).toBe(0);
    expect(counters.unknownCounts.get(vaultId)).toBe(1);
    expect(results.get(vaultId)?.displayState).not.toBe(TIMED_OUT_STATE);
    expect(results.get(vaultId)?.timeoutReason).toBeUndefined();
  });

  it("times out with unknown_status once the VP never ingests the pegin", () => {
    const vaultId = "0xvault-2";
    const results = new Map<string, PegoutPollingResult>();
    const counters = {
      failureCounts: new Map<string, number>(),
      unknownCounts: new Map([[vaultId, PEGOUT_MAX_UNKNOWN_STATUS_POLLS - 1]]),
    };

    applyPegoutNotIngested(vaultId, results, counters);

    expect(results.get(vaultId)).toEqual({
      displayState: TIMED_OUT_STATE,
      timeoutReason: "unknown_status",
    });
  });
});
