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

  it("renders each lane's own current group once per vault column", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)}
        vaultCount={2}
        currentVaultIndex={0}
        rawStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
      />,
    );

    // Both lanes sit on the WOTS step → one card each, and nothing later.
    expect(screen.getAllByText(COPY.deposit.groups.signWots)).toHaveLength(2);
    expect(
      screen.queryByText(COPY.deposit.groups.signPayout),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.groups.activateVault),
    ).not.toBeInTheDocument();
  });

  it("keeps a queued vault visible once the trunk folds away", () => {
    // The flow parks every lane on AWAIT_BTC_CONFIRMATION, then advances only
    // the vault it is processing. The queued lane is still on the trunk's last
    // step, but the trunk has folded into the pill — its column must show its
    // next group rather than vanish.
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)}
        vaultCount={2}
        currentVaultIndex={0}
        rawStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
        perVaultSteps={[
          DepositFlowStep.SUBMIT_WOTS_KEYS,
          DepositFlowStep.AWAIT_BTC_CONFIRMATION,
        ]}
      />,
    );

    expect(
      screen.getByText(COPY.deposit.progress.splitVaultColumnLabel(2)),
    ).toBeInTheDocument();
    // Both lanes show the "Set up claim" group: the active one expanded, the
    // queued one as a not-started header with nothing done inside it.
    expect(screen.getAllByText(COPY.deposit.groups.signWots)).toHaveLength(2);
    expect(
      screen.getByLabelText(COPY.deposit.a11y.groupStatus.upcoming),
    ).toBeInTheDocument();
  });

  it("keeps a finished vault visible while a sibling still runs", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SIGN_PAYOUTS)}
        vaultCount={2}
        currentVaultIndex={1}
        rawStep={DepositFlowStep.SIGN_PAYOUTS}
        perVaultSteps={[
          DepositFlowStep.COMPLETED,
          DepositFlowStep.SIGN_PAYOUTS,
        ]}
      />,
    );

    // The finished lane keeps its last group, marked completed.
    expect(
      screen.getByText(COPY.deposit.groups.activateVault),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(COPY.deposit.a11y.groupStatus.completed),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.progress.splitVaultColumnLabel(1)),
    ).toBeInTheDocument();
  });

  it("renders no vault columns while the shared trunk is still running", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SIGN_PEGIN_BTC)}
        vaultCount={2}
        currentVaultIndex={null}
        rawStep={DepositFlowStep.SIGN_PEGIN_BTC}
      />,
    );

    // Every lane is still on the shared Register-deposit group, so the columns
    // (labels included) stay out of the tree until the lanes diverge.
    expect(
      screen.queryByText(COPY.deposit.progress.splitVaultColumnLabel(1)),
    ).not.toBeInTheDocument();
  });

  it("holds the columns back while the trunk runs, even for a lane past the end", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SIGN_PEGIN_BTC)}
        vaultCount={2}
        currentVaultIndex={null}
        rawStep={DepositFlowStep.SIGN_PEGIN_BTC}
        perVaultSteps={[
          DepositFlowStep.COMPLETED,
          DepositFlowStep.SIGN_PEGIN_BTC,
        ]}
      />,
    );

    expect(
      screen.getByText(COPY.deposit.groups.registerDeposit),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.progress.splitVaultColumnLabel(1)),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.groups.activateVault),
    ).not.toBeInTheDocument();
  });

  it("keeps the trunk's Pre-PegIn fee selector on the un-started entry", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.DERIVE_VAULT_SECRET)}
        vaultCount={2}
        currentVaultIndex={null}
        rawStep={DepositFlowStep.DERIVE_VAULT_SECRET}
        started={false}
        preSignDetail={<div data-testid="pre-sign-detail" />}
      />,
    );

    expect(screen.getAllByTestId("pre-sign-detail")).toHaveLength(1);
    expect(
      screen.getByText(COPY.deposit.groups.registerDeposit),
    ).toBeInTheDocument();
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
