import { describe, expect, it, vi } from "vitest";

import type { DepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";

import { deriveSplitVaultProgress } from "../useSplitVaultProgress";

// `deriveSplitVaultProgress` is pure (the caller passes `getPollingResult`), so
// it needs neither the polling context nor the logger. Mock peginStateMachine
// with controllable stubs — the branch this test exercises is the per-column
// glue (done sibling → COMPLETED, not the active vault's step), not the real
// getPeginDisplayStep/isVaultPastActivation (covered by their own tests).
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ getPollingResult: () => undefined }),
}));
vi.mock("@/infrastructure", () => ({ logger: { error: vi.fn() } }));
// The real depositFlowSteps index pulls in the heavy flow implementations;
// the module under test only needs the enum. The test and the module share
// this mock, so the enum values stay consistent between them.
vi.mock("@/hooks/deposit/depositFlowSteps", () => ({
  DepositFlowStep: {
    RETRIEVE_SECRET: "RETRIEVE_SECRET",
    AWAIT_ACTIVATION_CONFIRMATION: "AWAIT_ACTIVATION_CONFIRMATION",
    COMPLETED: "COMPLETED",
  },
}));
vi.mock("@/models/peginStateMachine", () => ({
  getPeginDisplayStep: (s: { displayStep: DepositFlowStep | null }) =>
    s.displayStep,
  isVaultPastActivation: (s: { pastActivation: boolean } | undefined) =>
    s?.pastActivation === true,
}));

/** Fake peginState carrying just what the mocked helpers read. */
type FakeState = {
  displayStep: DepositFlowStep | null;
  pastActivation: boolean;
};

function pollingFor(states: Record<string, FakeState>) {
  return (id: string): DepositPollingResult | undefined =>
    states[id]
      ? ({ peginState: states[id] } as unknown as DepositPollingResult)
      : undefined;
}

describe("deriveSplitVaultProgress", () => {
  it("marks a fully-activated sibling COMPLETED instead of mirroring the active vault", () => {
    // Active vault mid-activation (Retrieve secret); the sibling already
    // activated — getPeginDisplayStep is null for it. It must render complete,
    // not reset to the active vault's step.
    const getPollingResult = pollingFor({
      "0xactive": {
        displayStep: DepositFlowStep.RETRIEVE_SECRET,
        pastActivation: false,
      },
      "0xdone": { displayStep: null, pastActivation: true },
    });

    const { perVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      ["0xactive", "0xdone"],
      "0xactive",
      DepositFlowStep.RETRIEVE_SECRET,
    );

    expect(perVaultSteps).toEqual([
      DepositFlowStep.RETRIEVE_SECRET,
      DepositFlowStep.COMPLETED,
    ]);
  });

  it("keeps a sibling that still has a display step on that step (optimistic awaiting-confirmation)", () => {
    // VERIFIED+CONFIRMED is past activation but still yields a display step
    // (awaiting on-chain confirmation), so it must NOT collapse to COMPLETED.
    const getPollingResult = pollingFor({
      "0xactive": {
        displayStep: DepositFlowStep.RETRIEVE_SECRET,
        pastActivation: false,
      },
      "0xconfirming": {
        displayStep: DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION,
        pastActivation: true,
      },
    });

    const { perVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      ["0xactive", "0xconfirming"],
      "0xactive",
      DepositFlowStep.RETRIEVE_SECRET,
    );

    expect(perVaultSteps?.[1]).toBe(
      DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION,
    );
  });
});
