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

  it("returns the generate-secret label for the first step", () => {
    expect(getStepLabel(DepositFlowStep.DERIVE_VAULT_SECRET)).toBe(
      COPY.deposit.steps.generateSecret,
    );
  });

  it("aligns the visual step index with the total step count", () => {
    // The last actionable step must map within the bounds of the label list so
    // getStepLabel never falls back to an empty string for a real step.
    expect(getVisualStep(DepositFlowStep.ACTIVATE_VAULT)).toBe(
      TOTAL_VISUAL_STEPS,
    );
  });
});

describe("getStepFillPercent", () => {
  it("fills by completed steps, not the in-progress current step", () => {
    // AWAIT_BTC_CONFIRMATION is visual step 6 -> 5 completed of 11.
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_BTC_CONFIRMATION),
    ).toBeCloseTo(5 / TOTAL_VISUAL_STEPS);
  });

  it("never reports a full bar on the last actionable step", () => {
    // ACTIVATE_VAULT is the last step; 10 completed of 11, never 100%.
    expect(getStepFillPercent(DepositFlowStep.ACTIVATE_VAULT)).toBeCloseTo(
      (TOTAL_VISUAL_STEPS - 1) / TOTAL_VISUAL_STEPS,
    );
    expect(getStepFillPercent(DepositFlowStep.ACTIVATE_VAULT)).toBeLessThan(1);
  });
});
