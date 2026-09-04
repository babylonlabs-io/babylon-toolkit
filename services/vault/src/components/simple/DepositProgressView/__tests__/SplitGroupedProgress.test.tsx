import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { SplitGroupedProgress } from "../SplitGroupedProgress";
import { buildStepItems, getVisualStep } from "../steps";

const steps = buildStepItems(null);

describe("SplitGroupedProgress", () => {
  it("renders a labelled lane for each vault in a split deposit", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)}
        vaultCount={2}
        currentVaultIndex={0}
        rawStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
      />,
    );

    expect(
      screen.getByText(COPY.deposit.progress.splitVaultLabel(1)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.progress.splitVaultLabel(2)),
    ).toBeInTheDocument();
  });

  it("renders the trunk's Register-deposit group exactly once (shared across vaults)", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SIGN_PEGIN_BTC)}
        vaultCount={2}
        currentVaultIndex={null}
        rawStep={DepositFlowStep.SIGN_PEGIN_BTC}
      />,
    );

    const trunkHeaders = screen.getAllByText(
      COPY.deposit.groups.registerDeposit,
    );
    expect(trunkHeaders).toHaveLength(1);
  });

  it("renders each post-trunk group once per vault lane", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)}
        vaultCount={2}
        currentVaultIndex={0}
        rawStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
      />,
    );

    expect(screen.getAllByText(COPY.deposit.groups.signWots)).toHaveLength(2);
    expect(screen.getAllByText(COPY.deposit.groups.signPayout)).toHaveLength(2);
    expect(screen.getAllByText(COPY.deposit.groups.activateVault)).toHaveLength(
      2,
    );
  });

  it("expands each lane at its own active step when the vaults diverge", () => {
    // Resume path: vault 2 (active) is ready to activate (global step 14)
    // while vault 1 (queued) is still on WOTS submission (global step 7).
    // Each lane expands only its own active group and marks its own global
    // step active — proving the lanes track distinct, divergent states
    // rather than a single shared phase.
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.ACTIVATE_VAULT)}
        vaultCount={2}
        currentVaultIndex={1}
        rawStep={DepositFlowStep.ACTIVATE_VAULT}
        perVaultSteps={[
          DepositFlowStep.SUBMIT_WOTS_KEYS,
          DepositFlowStep.ACTIVATE_VAULT,
        ]}
      />,
    );

    // Queued lane marks the WOTS-submission row (global step 7) active.
    expect(
      screen.getByLabelText(
        COPY.deposit.a11y.stepActive(
          getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS),
        ),
      ),
    ).toBeInTheDocument();

    // Active lane marks the reveal-secret/activate row (global step 14)
    // active — a different group than the queued lane. getByLabelText also
    // asserts each active marker is unique (no lane bleeds into another).
    expect(
      screen.getByLabelText(
        COPY.deposit.a11y.stepActive(
          getVisualStep(DepositFlowStep.ACTIVATE_VAULT),
        ),
      ),
    ).toBeInTheDocument();
  });

  // renderStepDetail produces a panel only for the AWAIT_PAYOUT_TRANSACTIONS
  // step; each lane resolves it from its OWN step.
  const renderStepDetail = (step: DepositFlowStep) =>
    step === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ? (
      <div data-testid="wait-detail">waiting…</div>
    ) : null;

  it("renders the detail only in the lane whose own step produces one", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS)}
        vaultCount={2}
        currentVaultIndex={1}
        rawStep={DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS}
        perVaultSteps={[
          DepositFlowStep.SUBMIT_WOTS_KEYS,
          DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        ]}
        renderStepDetail={renderStepDetail}
      />,
    );

    // Only the AWAIT_PAYOUT lane (vault 2) shows it; the WOTS lane doesn't.
    expect(screen.getAllByTestId("wait-detail")).toHaveLength(1);
  });

  it("renders the shared detail in BOTH lanes when both sit on the same wait", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS)}
        vaultCount={2}
        currentVaultIndex={0}
        rawStep={DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS}
        perVaultSteps={[
          DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
          DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
        ]}
        renderStepDetail={renderStepDetail}
      />,
    );

    // Both vaults await the same shared Pre-PegIn confirmation, so the panel
    // renders under each lane (regression guard for the "vault 2 shows
    // nothing" bug).
    expect(screen.getAllByTestId("wait-detail")).toHaveLength(2);
  });
});
