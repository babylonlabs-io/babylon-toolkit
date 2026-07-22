import { describe, expect, it } from "vitest";

import {
  ClaimerPegoutStatusValue,
  getPegoutDisplayState,
  TIMED_OUT_STATE,
} from "../../models/pegoutStateMachine";
import {
  collectPegoutTerminalEvents,
  createPegoutTerminalTracking,
} from "../pegoutTerminalEvents";
import type { PegoutPollingResult } from "../usePegoutPolling";

function resultWithStatus(claimerStatus: string): PegoutPollingResult {
  return {
    displayState: getPegoutDisplayState(claimerStatus, true),
    response: {
      found: true,
      claimer: { status: claimerStatus },
    } as PegoutPollingResult["response"],
  };
}

const IN_PROGRESS = resultWithStatus(ClaimerPegoutStatusValue.CLAIM_BROADCAST);

describe("collectPegoutTerminalEvents", () => {
  it("emits the payout_broadcast success terminal once when a seen vault reaches it", () => {
    const tracking = createPegoutTerminalTracking();

    // First poll: in progress — marks seen, emits nothing.
    expect(
      collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking),
    ).toEqual([]);

    const broadcast = new Map([
      ["0xa", resultWithStatus(ClaimerPegoutStatusValue.PAYOUT_BROADCAST)],
    ]);
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([
      {
        event: "exit.redeem.payout_broadcast",
        level: "info",
        vaultId: "0xa",
      },
    ]);

    // Terminal status re-observed — no re-emit.
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([]);
  });

  it("emits payout_blocked as a warning terminal", () => {
    const tracking = createPegoutTerminalTracking();
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);

    const blocked = new Map([
      ["0xa", resultWithStatus(ClaimerPegoutStatusValue.PAYOUT_BLOCKED)],
    ]);
    expect(collectPegoutTerminalEvents(blocked, tracking)).toEqual([
      {
        event: "exit.redeem.payout_blocked",
        level: "warning",
        vaultId: "0xa",
      },
    ]);
  });

  it("emits pegout_timeout with the give-up reason", () => {
    const tracking = createPegoutTerminalTracking();
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);

    const timedOut = new Map<string, PegoutPollingResult>([
      [
        "0xa",
        {
          displayState: TIMED_OUT_STATE,
          timeoutReason: "consecutive_failures",
        },
      ],
    ]);
    expect(collectPegoutTerminalEvents(timedOut, tracking)).toEqual([
      {
        event: "exit.redeem.pegout_timeout",
        level: "warning",
        vaultId: "0xa",
        timeoutReason: "consecutive_failures",
      },
    ]);
    expect(collectPegoutTerminalEvents(timedOut, tracking)).toEqual([]);
  });

  it("emits a second timeout that fires down a different give-up path, but not the same one", () => {
    const tracking = createPegoutTerminalTracking();
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);

    const failures = new Map<string, PegoutPollingResult>([
      [
        "0xa",
        {
          displayState: TIMED_OUT_STATE,
          timeoutReason: "consecutive_failures",
        },
      ],
    ]);
    expect(collectPegoutTerminalEvents(failures, tracking)).toHaveLength(1);

    // Recovers, then gives up again — this time on unknown statuses.
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);
    const unknown = new Map<string, PegoutPollingResult>([
      [
        "0xa",
        { displayState: TIMED_OUT_STATE, timeoutReason: "unknown_status" },
      ],
    ]);
    expect(collectPegoutTerminalEvents(unknown, tracking)).toEqual([
      {
        event: "exit.redeem.pegout_timeout",
        level: "warning",
        vaultId: "0xa",
        timeoutReason: "unknown_status",
      },
    ]);

    // A repeat of an already-emitted reason stays deduped.
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);
    expect(collectPegoutTerminalEvents(unknown, tracking)).toEqual([]);
  });

  it("seeds a vault already terminal at first observation without emitting (no page-load burst)", () => {
    const tracking = createPegoutTerminalTracking();
    const broadcast = new Map([
      ["0xold", resultWithStatus(ClaimerPegoutStatusValue.PAYOUT_BROADCAST)],
    ]);

    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([]);
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([]);
  });

  it("does not seed from a failure-shaped first poll, so a prior-session terminal stays suppressed", () => {
    const tracking = createPegoutTerminalTracking();

    // First poll after reload fails (applyPegoutFailure shape: no response,
    // no give-up reason): not an observation.
    const failed = new Map<string, PegoutPollingResult>([
      ["0xold", { displayState: getPegoutDisplayState(undefined, false) }],
    ]);
    expect(collectPegoutTerminalEvents(failed, tracking)).toEqual([]);

    // Next poll succeeds and reports the prior-session terminal: first genuine
    // observation, so it seeds without emitting.
    const broadcast = new Map([
      ["0xold", resultWithStatus(ClaimerPegoutStatusValue.PAYOUT_BROADCAST)],
    ]);
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([]);
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([]);
  });

  it("still emits a genuine transition after an initial failure-shaped poll", () => {
    const tracking = createPegoutTerminalTracking();

    const failed = new Map<string, PegoutPollingResult>([
      ["0xa", { displayState: getPegoutDisplayState(undefined, false) }],
    ]);
    collectPegoutTerminalEvents(failed, tracking);

    // First genuine observation is in progress — seeds.
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);

    // The in-session terminal that follows emits.
    const broadcast = new Map([
      ["0xa", resultWithStatus(ClaimerPegoutStatusValue.PAYOUT_BROADCAST)],
    ]);
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([
      {
        event: "exit.redeem.payout_broadcast",
        level: "info",
        vaultId: "0xa",
      },
    ]);
  });

  it("still emits the success terminal after a timeout if a later poll recovers", () => {
    const tracking = createPegoutTerminalTracking();
    collectPegoutTerminalEvents(new Map([["0xa", IN_PROGRESS]]), tracking);

    const timedOut = new Map<string, PegoutPollingResult>([
      [
        "0xa",
        { displayState: TIMED_OUT_STATE, timeoutReason: "unknown_status" },
      ],
    ]);
    collectPegoutTerminalEvents(timedOut, tracking);

    const broadcast = new Map([
      ["0xa", resultWithStatus(ClaimerPegoutStatusValue.PAYOUT_BROADCAST)],
    ]);
    expect(collectPegoutTerminalEvents(broadcast, tracking)).toEqual([
      {
        event: "exit.redeem.payout_broadcast",
        level: "info",
        vaultId: "0xa",
      },
    ]);
  });
});
