import { describe, expect, it } from "vitest";

import {
  canRun,
  clearSessionFrom,
  HARNESS_STEPS,
  initialHarnessState,
  reduceHarness,
  SESSION_FIELDS_BY_STEP,
} from "../harnessState";

describe("reduceHarness", () => {
  it("only lets a step run once every earlier step is done", () => {
    let state = initialHarnessState();
    expect(canRun(state, "connect")).toBe(true);
    expect(canRun(state, "context")).toBe(false);

    state = reduceHarness(state, {
      type: "done",
      step: "connect",
      detail: "tb1p…",
    });
    expect(canRun(state, "context")).toBe(true);
    expect(canRun(state, "artifacts")).toBe(false);
  });

  it("records a failure with its message and keeps the step runnable again", () => {
    let state = reduceHarness(initialHarnessState(), {
      type: "start",
      step: "connect",
    });
    expect(state.connect.status).toBe("running");

    state = reduceHarness(state, {
      type: "fail",
      step: "connect",
      detail: "user rejected",
    });
    expect(state.connect).toEqual({ status: "error", detail: "user rejected" });
    expect(canRun(state, "connect")).toBe(true);
  });

  it("resets every step after the invalidated one, so a new vault id or wallet restarts the flow", () => {
    let state = initialHarnessState();
    for (const step of HARNESS_STEPS) {
      state = reduceHarness(state, { type: "done", step, detail: step });
    }
    state = reduceHarness(state, { type: "invalidateAfter", step: "context" });

    expect(state.connect.status).toBe("done");
    expect(state.context.status).toBe("done");
    expect(state.artifacts).toEqual({ status: "idle", detail: "" });
    expect(state.payout).toEqual({ status: "idle", detail: "" });
    expect(canRun(state, "artifacts")).toBe(true);
    expect(canRun(state, "wots")).toBe(false);
  });
});

describe("clearSessionFrom", () => {
  it("a vault change drops everything downstream — the device terms and every broadcastable hex included", () => {
    const session = {
      wallet: "w",
      chain: "c",
      depositTerms: "t",
      plan: "p",
      signatures: "s",
      artifactsJson: "a",
      claimTxHex: "x",
      assertTxHex: "y",
      payoutTxHex: "z",
    };
    clearSessionFrom(session, "context");
    expect(session).toEqual({ wallet: "w" });
  });

  it("a plan rebuild keeps the terms: they depend on the vault and wallet, not on the plan", () => {
    const session = {
      chain: "c",
      depositTerms: "t",
      plan: "p",
      partialSignatures: "ps",
      signatures: "s",
    };
    clearSessionFrom(session, "plan");
    expect(session).toEqual({ chain: "c", depositTerms: "t" });
  });

  it("files every session field under exactly one step", () => {
    const keys = HARNESS_STEPS.flatMap((step) => [
      ...SESSION_FIELDS_BY_STEP[step],
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
