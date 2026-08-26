import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { SplitGroupedProgress } from "../SplitGroupedProgress";
import { buildStepItems, getVisualStep } from "../steps";

const steps = buildStepItems(null);

describe("SplitGroupedProgress", () => {
  it("renders a labelled column for each vault in a split deposit", () => {
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
      screen.getByText(COPY.deposit.progress.splitVaultColumnLabel(1)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.progress.splitVaultColumnLabel(2)),
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

  it("renders each post-trunk group once per vault column", () => {
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

  it("expands each column at its own active step when the vaults diverge", () => {
    // Resume path: vault 2 (active) is ready to activate (global step 14)
    // while vault 1 (queued) is still on WOTS submission (global step 7).
    // Each column expands only its own active group and marks its own global
    // step active — proving the columns track distinct, divergent states
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

    // Queued column marks the WOTS-submission row (global step 7) active.
    expect(
      screen.getByLabelText(
        COPY.deposit.a11y.stepActive(
          getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS),
        ),
      ),
    ).toBeInTheDocument();

    // Active column marks the reveal-secret/activate row (global step 14)
    // active — a different group than the queued column. getByLabelText also
    // asserts each active marker is unique (no column bleeds into another).
    expect(
      screen.getByLabelText(
        COPY.deposit.a11y.stepActive(
          getVisualStep(DepositFlowStep.ACTIVATE_VAULT),
        ),
      ),
    ).toBeInTheDocument();
  });

  // renderStepDetail produces a panel only for the AWAIT_PAYOUT_TRANSACTIONS
  // step; each column resolves it from its OWN step.
  const renderStepDetail = (step: DepositFlowStep) =>
    step === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ? (
      <div data-testid="wait-detail">waiting…</div>
    ) : null;

  it("renders the detail only in the column whose own step produces one", () => {
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

    // Only the AWAIT_PAYOUT column (vault 2) shows it; the WOTS column doesn't.
    expect(screen.getAllByTestId("wait-detail")).toHaveLength(1);
  });

  it("renders the shared detail in BOTH columns when both sit on the same wait", () => {
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
    // renders under each column (regression guard for the "vault 2 shows
    // nothing" bug).
    expect(screen.getAllByTestId("wait-detail")).toHaveLength(2);
  });
});
