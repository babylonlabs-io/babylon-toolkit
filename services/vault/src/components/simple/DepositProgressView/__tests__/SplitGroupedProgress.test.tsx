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

  it("expands the WOTS sub-step inside the active vault's column during WOTS submission", () => {
    render(
      <SplitGroupedProgress
        steps={steps}
        currentStep={getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)}
        vaultCount={2}
        currentVaultIndex={0}
        rawStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
      />,
    );

    // Vault 1 (active) has its WOTS sub-step expanded; vault 2 (queued)
    // also sits in the same phase so its column shows the same label.
    expect(
      screen.getAllByText(COPY.deposit.steps.submitWotsKey).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
