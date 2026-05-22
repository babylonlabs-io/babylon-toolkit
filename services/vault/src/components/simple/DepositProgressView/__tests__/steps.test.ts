import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import {
  buildStepItems,
  getStepFillPercent,
  getStepLabel,
  getVisualStep,
  TOTAL_VISUAL_STEPS,
} from "../steps";

describe("getStepLabel", () => {
  it("returns the awaiting-confirmation label for AWAIT_BTC_CONFIRMATION", () => {
    expect(getStepLabel(DepositFlowStep.AWAIT_BTC_CONFIRMATION)).toBe(
      COPY.deposit.steps.awaitBtcConfirmation,
    );
  });

  it("returns the reveal-secret label for ACTIVATE_VAULT", () => {
    expect(getStepLabel(DepositFlowStep.ACTIVATE_VAULT)).toBe(
      COPY.deposit.steps.revealSecret,
    );
  });

  it("returns labels for the inserted wait steps", () => {
    expect(getStepLabel(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS)).toBe(
      COPY.deposit.steps.awaitPayoutTransactions,
    );
    expect(getStepLabel(DepositFlowStep.AWAIT_VP_VERIFICATION)).toBe(
      COPY.deposit.steps.awaitVpVerification,
    );
    expect(getStepLabel(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION)).toBe(
      COPY.deposit.steps.awaitActivationConfirmation,
    );
  });

  it("returns the recovery-transactions label for SIGN_DEPOSITOR_GRAPH", () => {
    expect(getStepLabel(DepositFlowStep.SIGN_DEPOSITOR_GRAPH)).toBe(
      COPY.deposit.steps.signRecoveryTxs,
    );
  });

  it("returns the retrieve-secret label for RETRIEVE_SECRET", () => {
    expect(getStepLabel(DepositFlowStep.RETRIEVE_SECRET)).toBe(
      COPY.deposit.steps.retrieveSecret,
    );
  });

  it("returns the generate-secret label for the first step", () => {
    expect(getStepLabel(DepositFlowStep.DERIVE_VAULT_SECRET)).toBe(
      COPY.deposit.steps.generateSecret,
    );
  });

  it("aligns the visual step index with the total step count", () => {
    // The last actionable step must map within the bounds of the label list so
    // getStepLabel never falls back to an empty string for a real step.
    expect(getVisualStep(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION)).toBe(
      TOTAL_VISUAL_STEPS,
    );
  });

  it("renumbers existing post-WOTS action steps after the payout wait", () => {
    expect(getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)).toBe(7);
    expect(getVisualStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS)).toBe(8);
    expect(getVisualStep(DepositFlowStep.SIGN_AUTH_ANCHOR)).toBe(9);
    expect(getVisualStep(DepositFlowStep.SIGN_PAYOUTS)).toBe(10);
    expect(getVisualStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH)).toBe(11);
    expect(getVisualStep(DepositFlowStep.AWAIT_VP_VERIFICATION)).toBe(12);
    expect(getVisualStep(DepositFlowStep.ARTIFACT_DOWNLOAD)).toBe(13);
    expect(getVisualStep(DepositFlowStep.RETRIEVE_SECRET)).toBe(14);
    expect(getVisualStep(DepositFlowStep.ACTIVATE_VAULT)).toBe(15);
    expect(getVisualStep(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION)).toBe(
      16,
    );
  });
});

describe("getStepFillPercent", () => {
  it("fills by completed steps, not the in-progress current step", () => {
    // AWAIT_BTC_CONFIRMATION is visual step 6 -> 5 completed of 15.
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_BTC_CONFIRMATION),
    ).toBeCloseTo(5 / TOTAL_VISUAL_STEPS);
  });

  it("never reports a full bar on the last actionable step", () => {
    // AWAIT_ACTIVATION_CONFIRMATION is the last step; 14 completed of 15,
    // never 100% until the flow completes.
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION),
    ).toBeCloseTo((TOTAL_VISUAL_STEPS - 1) / TOTAL_VISUAL_STEPS);
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION),
    ).toBeLessThan(1);
  });
});

describe("buildStepItems payout-signing counters", () => {
  const signPayouts = (items: ReturnType<typeof buildStepItems>) =>
    items[getVisualStep(DepositFlowStep.SIGN_PAYOUTS) - 1];
  const signRecovery = (items: ReturnType<typeof buildStepItems>) =>
    items[getVisualStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH) - 1];

  it("puts the counter on the payout step during the claimers phase", () => {
    const items = buildStepItems({ phase: "claimers", completed: 2, total: 5 });
    expect(signPayouts(items).description).toBe(
      COPY.deposit.steps.signingCounter(2, 5),
    );
    expect(signRecovery(items).description).toBeUndefined();
  });

  it("puts the counter on the recovery step during the graph phase", () => {
    const items = buildStepItems({ phase: "graph", completed: 3, total: 9 });
    expect(signRecovery(items).description).toBe(
      COPY.deposit.steps.signingCounter(3, 9),
    );
    expect(signPayouts(items).description).toBeUndefined();
  });
});
