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
  // Numeric values mirror the real DepositFlowStep enum so the module's
  // ordered comparisons (e.g. the trunk-floor cap) behave as in production.
  DepositFlowStep: {
    BROADCAST_PRE_PEGIN: 5,
    AWAIT_BTC_CONFIRMATION: 6,
    SUBMIT_WOTS_KEYS: 7,
    AWAIT_VP_VERIFICATION: 12,
    RETRIEVE_SECRET: 13,
    AWAIT_ACTIVATION_CONFIRMATION: 15,
    COMPLETED: 16,
  },
}));
vi.mock("@/models/peginStateMachine", () => ({
  getPeginDisplayStep: (s: { displayStep: DepositFlowStep | null }) =>
    s.displayStep,
  getWarningPeginDisplayStep: (localStatus: string | undefined) =>
    localStatus === "confirming"
      ? DepositFlowStep.AWAIT_BTC_CONFIRMATION
      : DepositFlowStep.SUBMIT_WOTS_KEYS,
  isVaultPastActivation: (s: { pastActivation: boolean } | undefined) =>
    s?.pastActivation === true,
}));

/** Fake peginState carrying just what the mocked helpers read. */
type FakeState = {
  displayStep: DepositFlowStep | null;
  pastActivation: boolean;
  displayVariant?: "pending" | "active" | "inactive" | "warning" | "danger";
  localStatus?: string;
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

  it("renders a sibling with no polled state at the shared-trunk floor, not the active vault's step", () => {
    // The active vault is mid-payout (AWAIT_VP_VERIFICATION). A sibling whose
    // polling result hasn't loaded yet (getPollingResult → undefined) must NOT
    // mirror the active vault's ahead step — that falsely shows it as signed.
    // It renders the trunk floor every registered+broadcast sibling has reached.
    const getPollingResult = pollingFor({
      "0xactive": {
        displayStep: DepositFlowStep.AWAIT_VP_VERIFICATION,
        pastActivation: false,
      },
      // "0xunpolled" intentionally absent → getPollingResult returns undefined.
    });

    const { perVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      ["0xactive", "0xunpolled"],
      "0xactive",
      DepositFlowStep.AWAIT_VP_VERIFICATION,
    );

    expect(perVaultSteps?.[1]).toBe(DepositFlowStep.AWAIT_BTC_CONFIRMATION);
  });

  it("tracks the shared-trunk step for an unpolled sibling during the pre-broadcast phase", () => {
    // While the batch is still on the shared trunk (e.g. resume-broadcast, where
    // active = BROADCAST_PRE_PEGIN), an unpolled sibling tracks the active trunk
    // step — flooring it to AWAIT_BTC_CONFIRMATION would overstate it as already
    // past broadcast.
    const getPollingResult = pollingFor({
      "0xactive": {
        displayStep: DepositFlowStep.BROADCAST_PRE_PEGIN,
        pastActivation: false,
      },
      // "0xunpolled" intentionally absent → getPollingResult returns undefined.
    });

    const { perVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      ["0xactive", "0xunpolled"],
      "0xactive",
      DepositFlowStep.BROADCAST_PRE_PEGIN,
    );

    expect(perVaultSteps?.[1]).toBe(DepositFlowStep.BROADCAST_PRE_PEGIN);
  });

  it("freezes a warning sibling at its own local step instead of mirroring the active vault", () => {
    const getPollingResult = pollingFor({
      "0xactive": {
        displayStep: DepositFlowStep.RETRIEVE_SECRET,
        pastActivation: false,
      },
      "0xwarning": {
        displayStep: null,
        pastActivation: false,
        displayVariant: "warning",
        localStatus: "confirming",
      },
    });

    const { perVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      ["0xactive", "0xwarning"],
      "0xactive",
      DepositFlowStep.RETRIEVE_SECRET,
    );

    expect(perVaultSteps?.[1]).toBe(DepositFlowStep.AWAIT_BTC_CONFIRMATION);
  });

  it("freezes a liquidated (danger) sibling at its own local step instead of COMPLETED", () => {
    // LIQUIDATED is past activation, so the COMPLETED branch would match —
    // but a seized vault must freeze at its last known local step, not render
    // all-checkmarks. The danger check has to win over isVaultPastActivation.
    const getPollingResult = pollingFor({
      "0xactive": {
        displayStep: DepositFlowStep.RETRIEVE_SECRET,
        pastActivation: false,
      },
      "0xliquidated": {
        displayStep: null,
        pastActivation: true,
        displayVariant: "danger",
        localStatus: "confirming",
      },
    });

    const { perVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      ["0xactive", "0xliquidated"],
      "0xactive",
      DepositFlowStep.RETRIEVE_SECRET,
    );

    expect(perVaultSteps?.[1]).toBe(DepositFlowStep.AWAIT_BTC_CONFIRMATION);
  });
});
