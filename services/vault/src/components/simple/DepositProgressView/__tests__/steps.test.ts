import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import {
  buildStepGroups,
  buildStepItems,
  derivePerVaultStep,
  getStepFillPercent,
  getStepLabel,
  getVisualStep,
  STEP_GROUPS,
  TOTAL_VISUAL_STEPS,
} from "../steps";

describe("getStepLabel", () => {
  it("returns the inclusion-wait label for AWAIT_BTC_CONFIRMATION", () => {
    expect(getStepLabel(DepositFlowStep.AWAIT_BTC_CONFIRMATION)).toBe(
      COPY.deposit.steps.confirmingDeposit,
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

  it("keeps AWAIT_BTC_CONFIRMATION at visual step 6 (VP-ingestion shares it)", () => {
    expect(getVisualStep(DepositFlowStep.AWAIT_BTC_CONFIRMATION)).toBe(6);
  });

  it("numbers post-confirmation steps with no gap where VP-ingestion was", () => {
    expect(getVisualStep(DepositFlowStep.SUBMIT_WOTS_KEYS)).toBe(7);
    expect(getVisualStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS)).toBe(8);
    expect(getVisualStep(DepositFlowStep.SIGN_AUTH_ANCHOR)).toBe(9);
    expect(getVisualStep(DepositFlowStep.SIGN_PAYOUTS)).toBe(10);
    expect(getVisualStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH)).toBe(11);
    expect(getVisualStep(DepositFlowStep.AWAIT_VP_VERIFICATION)).toBe(12);
    expect(getVisualStep(DepositFlowStep.RETRIEVE_SECRET)).toBe(13);
    expect(getVisualStep(DepositFlowStep.ACTIVATE_VAULT)).toBe(14);
    expect(getVisualStep(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION)).toBe(
      15,
    );
  });
});

describe("getStepFillPercent", () => {
  it("fills by completed steps, not the in-progress current step", () => {
    // AWAIT_BTC_CONFIRMATION is visual step 6 -> 5 completed of TOTAL.
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_BTC_CONFIRMATION),
    ).toBeCloseTo(5 / TOTAL_VISUAL_STEPS);
  });

  it("fills the bar fully on the final awaiting-confirmation step", () => {
    expect(
      getStepFillPercent(DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION),
    ).toBe(1);
  });

  it("keeps the bar partial on the last actionable step (activate)", () => {
    expect(getStepFillPercent(DepositFlowStep.ACTIVATE_VAULT)).toBeLessThan(1);
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

describe("STEP_GROUPS", () => {
  it("covers every visual step from 1..TOTAL_VISUAL_STEPS with no gaps or overlaps", () => {
    expect(STEP_GROUPS[0].startStep).toBe(1);
    expect(STEP_GROUPS[STEP_GROUPS.length - 1].endStep).toBe(
      TOTAL_VISUAL_STEPS,
    );

    for (let i = 1; i < STEP_GROUPS.length; i++) {
      // Each group starts exactly one step after the previous group ends.
      expect(STEP_GROUPS[i].startStep).toBe(STEP_GROUPS[i - 1].endStep + 1);
    }

    const totalCovered = STEP_GROUPS.reduce(
      (sum, group) => sum + (group.endStep - group.startStep + 1),
      0,
    );
    expect(totalCovered).toBe(TOTAL_VISUAL_STEPS);
  });

  it("groups the steps into the four expected sections", () => {
    expect(STEP_GROUPS.map((g) => [g.title, g.startStep, g.endStep])).toEqual([
      [COPY.deposit.groups.registerDeposit, 1, 6],
      [COPY.deposit.groups.signWots, 7, 8],
      [COPY.deposit.groups.signPayout, 9, 12],
      [COPY.deposit.groups.activateVault, 13, 15],
    ]);
  });
});

describe("buildStepGroups", () => {
  it("expands exactly one group for any in-range step", () => {
    for (let step = 1; step <= TOTAL_VISUAL_STEPS; step++) {
      const expanded = buildStepGroups(step).filter((g) => g.expanded);
      expect(expanded).toHaveLength(1);
    }
  });

  it("expands the first group and leaves later groups upcoming at step 1", () => {
    const [register, wots, payout, activate] = buildStepGroups(1);

    expect(register.status).toBe("active");
    expect(register.expanded).toBe(true);
    expect(register.completedInGroup).toBe(0);
    expect(register.totalInGroup).toBe(6);

    expect(wots.status).toBe("upcoming");
    expect(wots.expanded).toBe(false);
    expect(payout.status).toBe("upcoming");
    expect(activate.status).toBe("upcoming");
  });

  it("marks earlier groups completed and activates the WOTS group at step 7", () => {
    const [register, wots, payout] = buildStepGroups(7);

    expect(register.status).toBe("completed");
    expect(register.expanded).toBe(false);
    expect(register.completedInGroup).toBe(6);

    expect(wots.status).toBe("active");
    expect(wots.expanded).toBe(true);
    expect(wots.completedInGroup).toBe(0);
    expect(wots.totalInGroup).toBe(2);

    expect(payout.status).toBe("upcoming");
  });

  it("counts completed sub-steps within the active group (mid-group resume)", () => {
    // Step 12 is the last step of the Sign payout group (9..12): 3 done, 1 active.
    const payout = buildStepGroups(12).find(
      (g) => g.title === COPY.deposit.groups.signPayout,
    );

    expect(payout?.status).toBe("active");
    expect(payout?.completedInGroup).toBe(3);
    expect(payout?.totalInGroup).toBe(4);
  });

  it("marks every group completed and collapsed on completion", () => {
    const groups = buildStepGroups(TOTAL_VISUAL_STEPS + 1);

    expect(groups.every((g) => g.status === "completed")).toBe(true);
    expect(groups.every((g) => !g.expanded)).toBe(true);
    expect(groups.every((g) => g.completedInGroup === g.totalInGroup)).toBe(
      true,
    );
  });
});

describe("derivePerVaultStep", () => {
  it("mirrors the shared step for every vault while the flow is in the trunk", () => {
    // Trunk phase (visual step <= 6) — all vaults track the shared step.
    expect(derivePerVaultStep(DepositFlowStep.SIGN_PEGIN_BTC, null, 0)).toBe(
      DepositFlowStep.SIGN_PEGIN_BTC,
    );
    expect(derivePerVaultStep(DepositFlowStep.BROADCAST_PRE_PEGIN, 0, 1)).toBe(
      DepositFlowStep.BROADCAST_PRE_PEGIN,
    );
  });

  it("returns the shared step for the active vault", () => {
    expect(derivePerVaultStep(DepositFlowStep.SIGN_PAYOUTS, 1, 1)).toBe(
      DepositFlowStep.SIGN_PAYOUTS,
    );
  });

  it("falls back to the shared step when no vault is active (transitional)", () => {
    expect(derivePerVaultStep(DepositFlowStep.SUBMIT_WOTS_KEYS, null, 0)).toBe(
      DepositFlowStep.SUBMIT_WOTS_KEYS,
    );
  });

  // A non-active vault's step is derived from what it has actually completed
  // (set membership), NOT its index relative to the active vault — the live flow
  // processes vaults in readiness order, so a higher-indexed vault can finish
  // before a lower one.

  it("keeps a non-active vault that has not submitted WOTS at the WOTS step", () => {
    expect(
      derivePerVaultStep(
        DepositFlowStep.SUBMIT_WOTS_KEYS,
        1,
        0,
        new Set(),
        new Set(),
      ),
    ).toBe(DepositFlowStep.SUBMIT_WOTS_KEYS);
  });

  it("shows a non-active WOTS-submitted vault at awaiting-payout even when higher-indexed than the active vault", () => {
    // Vault 2 finished WOTS while vault 0 is still the active one (readiness order).
    expect(
      derivePerVaultStep(
        DepositFlowStep.SUBMIT_WOTS_KEYS,
        0,
        2,
        new Set(),
        new Set([2]),
      ),
    ).toBe(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS);
  });

  it("keeps a non-active WOTS-submitted vault at awaiting-payout until it signs payouts", () => {
    expect(
      derivePerVaultStep(
        DepositFlowStep.SIGN_PAYOUTS,
        1,
        2,
        new Set(),
        new Set([2]),
      ),
    ).toBe(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS);
  });

  it("shows a non-active payout-signed vault at VP verification during the payout phase", () => {
    expect(
      derivePerVaultStep(
        DepositFlowStep.SIGN_PAYOUTS,
        1,
        0,
        new Set([0]),
        new Set([0]),
      ),
    ).toBe(DepositFlowStep.AWAIT_VP_VERIFICATION);
  });

  it("shows a non-active payout-signed vault heading to activation in the activation phase", () => {
    expect(
      derivePerVaultStep(
        DepositFlowStep.RETRIEVE_SECRET,
        1,
        0,
        new Set([0]),
        new Set([0]),
      ),
    ).toBe(DepositFlowStep.ACTIVATE_VAULT);
  });

  it("keeps a non-active vault that never submitted WOTS at the WOTS step in the activation phase", () => {
    // Failed/never-submitted vault stays conservatively at its real step rather
    // than being inferred forward by position.
    expect(
      derivePerVaultStep(
        DepositFlowStep.RETRIEVE_SECRET,
        1,
        0,
        new Set(),
        new Set(),
      ),
    ).toBe(DepositFlowStep.SUBMIT_WOTS_KEYS);
  });

  it("treats missing membership sets as nothing-completed for a non-active vault", () => {
    // Backward-compatible default: with no sets supplied, a non-active vault is
    // shown at the WOTS step, never inferred forward by position.
    expect(derivePerVaultStep(DepositFlowStep.SIGN_PAYOUTS, 1, 0)).toBe(
      DepositFlowStep.SUBMIT_WOTS_KEYS,
    );
  });
});
