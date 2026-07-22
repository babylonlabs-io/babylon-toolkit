import { DaemonStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { TerminalPeginPollingError } from "../../../utils/peginPolling";
import {
  collectDaemonTerminalEvents,
  createDaemonTerminalTracking,
} from "../daemonTerminalEvents";

const terminalError = (status: DaemonStatus) =>
  new TerminalPeginPollingError(status, "terminal");

describe("collectDaemonTerminalEvents", () => {
  it("emits once when a seen vault transitions to a terminal daemon status", () => {
    const tracking = createDaemonTerminalTracking();

    // First poll: healthy (no error) — marks the vault seen, emits nothing.
    expect(collectDaemonTerminalEvents(["0xa"], new Map(), tracking)).toEqual(
      [],
    );

    // VP reports AmlRejected — emits once.
    const errors = new Map([["0xa", terminalError(DaemonStatus.AML_REJECTED)]]);
    expect(collectDaemonTerminalEvents(["0xa"], errors, tracking)).toEqual([
      { vaultId: "0xa", daemonStatus: DaemonStatus.AML_REJECTED },
    ]);

    // Sticky terminal error re-observed every poll — no re-emit.
    expect(collectDaemonTerminalEvents(["0xa"], errors, tracking)).toEqual([]);
  });

  it("seeds a vault already terminal at first observation without emitting (no page-load burst)", () => {
    const tracking = createDaemonTerminalTracking();
    const errors = new Map([["0xold", terminalError(DaemonStatus.EXPIRED)]]);

    expect(collectDaemonTerminalEvents(["0xold"], errors, tracking)).toEqual(
      [],
    );
    expect(collectDaemonTerminalEvents(["0xold"], errors, tracking)).toEqual(
      [],
    );
  });

  it("emits each distinct terminal status once as a vault progresses Expired -> ExpiredCleanedUp", () => {
    const tracking = createDaemonTerminalTracking();
    collectDaemonTerminalEvents(["0xa"], new Map(), tracking);

    const expired = new Map([["0xa", terminalError(DaemonStatus.EXPIRED)]]);
    expect(collectDaemonTerminalEvents(["0xa"], expired, tracking)).toEqual([
      { vaultId: "0xa", daemonStatus: DaemonStatus.EXPIRED },
    ]);

    const cleanedUp = new Map([
      ["0xa", terminalError(DaemonStatus.EXPIRED_CLEANED_UP)],
    ]);
    expect(collectDaemonTerminalEvents(["0xa"], cleanedUp, tracking)).toEqual([
      { vaultId: "0xa", daemonStatus: DaemonStatus.EXPIRED_CLEANED_UP },
    ]);
    expect(collectDaemonTerminalEvents(["0xa"], cleanedUp, tracking)).toEqual(
      [],
    );
  });

  it("ignores non-terminal errors (provider connectivity) entirely", () => {
    const tracking = createDaemonTerminalTracking();
    collectDaemonTerminalEvents(["0xa"], new Map(), tracking);

    const errors = new Map([["0xa", new Error("Provider unreachable")]]);
    expect(collectDaemonTerminalEvents(["0xa"], errors, tracking)).toEqual([]);
  });

  it("does not seed from a connectivity-errored first poll, so a prior-session terminal stays suppressed", () => {
    const tracking = createDaemonTerminalTracking();

    // First poll after reload fails to reach the provider: not an observation.
    const unreachable = new Map([["0xold", new Error("Provider unreachable")]]);
    expect(
      collectDaemonTerminalEvents(["0xold"], unreachable, tracking),
    ).toEqual([]);

    // Next poll succeeds and reports the prior-session drop: this is the first
    // genuine observation, so it seeds without emitting.
    const errors = new Map([["0xold", terminalError(DaemonStatus.EXPIRED)]]);
    expect(collectDaemonTerminalEvents(["0xold"], errors, tracking)).toEqual(
      [],
    );
    expect(collectDaemonTerminalEvents(["0xold"], errors, tracking)).toEqual(
      [],
    );
  });

  it("still emits a genuine transition after an initial connectivity error", () => {
    const tracking = createDaemonTerminalTracking();

    const unreachable = new Map([["0xa", new Error("Provider unreachable")]]);
    collectDaemonTerminalEvents(["0xa"], unreachable, tracking);

    // First genuine observation is healthy — seeds.
    collectDaemonTerminalEvents(["0xa"], new Map(), tracking);

    // The in-session drop that follows emits.
    const errors = new Map([["0xa", terminalError(DaemonStatus.AML_REJECTED)]]);
    expect(collectDaemonTerminalEvents(["0xa"], errors, tracking)).toEqual([
      { vaultId: "0xa", daemonStatus: DaemonStatus.AML_REJECTED },
    ]);
  });
});
