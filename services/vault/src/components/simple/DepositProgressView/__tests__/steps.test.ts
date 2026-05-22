import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import {
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
    expect(getVisualStep(DepositFlowStep.AWAIT_VP_VERIFICATION)).toBe(11);
    expect(getVisualStep(DepositFlowStep.ARTIFACT_DOWNLOAD)).toBe(12);
    expect(getVisualStep(DepositFlowStep.ACTIVATE_VAULT)).toBe(13);
    expect(getVisualStep(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION)).toBe(
      14,
    );
  });
});

describe("getStepFillPercent", () => {
  it("fills by completed steps, not the in-progress current step", () => {
    // AWAIT_BTC_CONFIRMATION is visual step 6 -> 5 completed of 14.
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_BTC_CONFIRMATION),
    ).toBeCloseTo(5 / TOTAL_VISUAL_STEPS);
  });

  it("never reports a full bar on the last actionable step", () => {
    // AWAIT_ACTIVATION_CONFIRMATION is the last step; 13 completed of 14,
    // never 100% until the flow completes.
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION),
    ).toBeCloseTo((TOTAL_VISUAL_STEPS - 1) / TOTAL_VISUAL_STEPS);
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION),
    ).toBeLessThan(1);
  });
});
