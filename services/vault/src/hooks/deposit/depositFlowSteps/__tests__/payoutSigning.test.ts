import { describe, expect, it } from "vitest";

import { payoutSigningStep } from "../payoutSigning";
import { DepositFlowStep } from "../types";

describe("payoutSigningStep", () => {
  it("maps the auth-anchor phase to SIGN_AUTH_ANCHOR", () => {
    expect(payoutSigningStep("auth")).toBe(DepositFlowStep.SIGN_AUTH_ANCHOR);
  });

  it("maps the claimer phase to SIGN_PAYOUTS", () => {
    expect(payoutSigningStep("claimers")).toBe(DepositFlowStep.SIGN_PAYOUTS);
  });

  it("maps the depositor-graph phase to SIGN_DEPOSITOR_GRAPH", () => {
    expect(payoutSigningStep("graph")).toBe(
      DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
    );
  });
});
