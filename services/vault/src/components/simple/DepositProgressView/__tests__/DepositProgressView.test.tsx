import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { DepositProgressView } from "../DepositProgressView";

// The detail panel fetches confirmations and protocol params of its own;
// this suite covers only whether DepositProgressView mounts it per step.
vi.mock("../BtcConfirmationDetailContainer", () => ({
  BtcConfirmationDetailContainer: () => (
    <div data-testid="btc-confirmation-detail" />
  ),
}));

const baseProps = {
  error: null,
  isComplete: false,
  isProcessing: false,
  canClose: true,
  canContinueInBackground: false,
  payoutSigningProgress: null,
  peginSigningProgress: null,
  onClose: vi.fn(),
};

describe("DepositProgressView", () => {
  describe("grouped sections", () => {
    it("always renders the four group headers", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.DERIVE_VAULT_SECRET}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.groups.registerDeposit),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.groups.signWots),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.groups.signPayout),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.groups.activateVault),
      ).toBeInTheDocument();
    });

    it("expands only the section containing the current step", () => {
      // SUBMIT_WOTS_KEYS lives in the "Set up claim" group.
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
        />,
      );

      // Active group's sub-step is shown.
      expect(
        screen.getByText(COPY.deposit.steps.submitWotsKey),
      ).toBeInTheDocument();

      // A completed group's sub-step stays collapsed.
      expect(
        screen.queryByText(COPY.deposit.steps.generateSecret),
      ).not.toBeInTheDocument();

      // An upcoming group's sub-step stays collapsed.
      expect(
        screen.queryByText(COPY.deposit.steps.signPayouts),
      ).not.toBeInTheDocument();

      // The finished "Register deposit" group reports 7/7.
      expect(
        screen.getByText(COPY.deposit.groups.stepCounter(6, 6)),
      ).toBeInTheDocument();
    });
  });

  describe("pre-sign state (first step)", () => {
    it("expands the first group and hides the overall progress bar", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.DERIVE_VAULT_SECRET}
        />,
      );

      // First group (steps 1-6) is expanded.
      expect(
        screen.getByText(COPY.deposit.steps.generateSecret),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.steps.confirmingDeposit),
      ).toBeInTheDocument();

      // Later groups' sub-steps are collapsed.
      expect(
        screen.queryByText(COPY.deposit.steps.submitWotsKey),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(COPY.deposit.steps.retrieveSecret),
      ).not.toBeInTheDocument();

      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("shows the Sign CTA", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.DERIVE_VAULT_SECRET}
        />,
      );

      expect(screen.getByRole("button", { name: "Sign" })).toBeInTheDocument();
    });
  });

  describe("mid-flow progress bar", () => {
    it("renders the overall 'X of N steps completed' pill once a group is done", () => {
      // SUBMIT_WOTS_KEYS lives in the second group, so the first group
      // ("Register deposit") is fully complete -> 1 of 4 groups done.
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.progress.stepsCompleted(1, 4)),
      ).toBeInTheDocument();
    });

    it("hides the overall pill while the first group is still active", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      expect(screen.queryByText(/steps completed/)).not.toBeInTheDocument();
    });

    it("hides the overall pill before any step is completed", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.DERIVE_VAULT_SECRET}
        />,
      );

      expect(screen.queryByText(/steps completed/)).not.toBeInTheDocument();
    });

    it("renders the progress bar with the correct fill ratio", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      // AWAIT_BTC_CONFIRMATION is visual step 6 → 5 of 15 completed → 33%.
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "33");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("fills the bar fully on the final awaiting-confirmation step", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION}
        />,
      );

      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    });
  });

  describe("active-group sub-steps", () => {
    it("shows completed sub-steps of the active group with their labels", () => {
      // Step 6 -> "Register deposit" group active; steps 1-5 already done.
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.generateSecret),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.steps.confirmingDeposit),
      ).toBeInTheDocument();
      // Steps in other (collapsed) groups remain hidden.
      expect(
        screen.queryByText(COPY.deposit.steps.submitWotsKey),
      ).not.toBeInTheDocument();
    });

    it("renders pending sub-steps as label-only (no descriptions)", () => {
      // Step 9 -> "Sign payout" group active; step 10 (Sign payouts) is pending.
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SIGN_AUTH_ANCHOR}
          payoutSigningProgress={{ phase: "claimers", completed: 0, total: 3 }}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.signPayouts),
      ).toBeInTheDocument();
      expect(screen.queryByText("(0 of 3)")).not.toBeInTheDocument();
    });

    it("renders a status detail panel for the verifying-deposit wait step", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_VP_VERIFICATION}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.awaitVpVerification),
      ).toBeInTheDocument();
      expect(screen.getByText("Status:")).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.waitDetails.verifyingDeposit),
      ).toBeInTheDocument();
    });

    it("falls back to the generic wait panel at AWAIT_PAYOUT_TRANSACTIONS when no btcConfirmationDetail (resume flow)", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.waitDetails.awaitingBtcDepthAndVpSetup),
      ).toBeInTheDocument();
    });
  });

  describe("peg-in signing sub-counter", () => {
    it("shows the (x of n) counter on the active peg-in step for a split deposit", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SIGN_PEGIN_BTC}
          peginSigningProgress={{ completed: 0, total: 2 }}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.signPeginBtc),
      ).toBeInTheDocument();
      expect(screen.getByText("(0 of 2)")).toBeInTheDocument();
    });

    it("renders (1 of 2) for an in-flight split deposit", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SIGN_PEGIN_BTC}
          peginSigningProgress={{ completed: 1, total: 2 }}
        />,
      );

      expect(screen.getByText("(1 of 2)")).toBeInTheDocument();
    });

    it("omits the counter for a single-vault (non-split) deposit", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SIGN_PEGIN_BTC}
          peginSigningProgress={{ completed: 0, total: 1 }}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.signPeginBtc),
      ).toBeInTheDocument();
      expect(screen.queryByText(/of 1\)/)).not.toBeInTheDocument();
    });

    it("omits the counter when no peg-in progress is set", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SIGN_PEGIN_BTC}
          peginSigningProgress={null}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.signPeginBtc),
      ).toBeInTheDocument();
      expect(screen.queryByText(/^\(\d+ of \d+\)$/)).not.toBeInTheDocument();
    });
  });

  describe("CTA copy", () => {
    it("flips to the wait-state copy when canContinueInBackground is true", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          canContinueInBackground
        />,
      );

      expect(
        screen.getByRole("button", {
          name: "Close & continue later",
        }),
      ).toBeInTheDocument();
    });

    it("shows Done when complete", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.ACTIVATE_VAULT}
          isComplete
        />,
      );

      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    });
  });

  describe("complete state", () => {
    it("collapses all groups with full counters and fills the progress bar", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.ACTIVATE_VAULT}
          isComplete
        />,
      );

      expect(
        screen.getByText(COPY.deposit.groups.stepCounter(6, 6)),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.groups.stepCounter(4, 4)),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.groups.stepCounter(3, 3)),
      ).toBeInTheDocument();
      // No expanded sub-steps remain.
      expect(
        screen.queryByText(COPY.deposit.steps.revealSecret),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    });

    it("reports complete when currentStep is COMPLETED", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.COMPLETED}
          isComplete
        />,
      );

      expect(
        screen.getByText(COPY.deposit.groups.stepCounter(6, 6)),
      ).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    });
  });

  describe("BTC confirmation detail panel", () => {
    const PRE_PEGIN_TXID =
      "1b2c3d4e5f00000000000000000000000000000000000000000000000000000000";
    const NOW = new Date("2026-01-01T14:00:00Z").getTime();

    it("renders the confirmation detail when the active step is AWAIT_PAYOUT_TRANSACTIONS", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS}
          btcConfirmationDetail={{
            startedAt: NOW,
            prePeginTxid: PRE_PEGIN_TXID,
            requiredDepth: 6,
            depositIds: ["0xvault"],
          }}
        />,
      );

      expect(screen.getByTestId("btc-confirmation-detail")).toBeInTheDocument();
    });

    it("does not render the detail panel at AWAIT_BTC_CONFIRMATION (1-conf gate, no counter)", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={{
            startedAt: NOW,
            prePeginTxid: PRE_PEGIN_TXID,
            requiredDepth: 6,
            depositIds: ["0xvault"],
          }}
        />,
      );

      expect(
        screen.queryByTestId("btc-confirmation-detail"),
      ).not.toBeInTheDocument();
    });

    it("does not render the detail panel for steps other than AWAIT_PAYOUT_TRANSACTIONS", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
          btcConfirmationDetail={{
            startedAt: NOW,
            prePeginTxid: PRE_PEGIN_TXID,
            requiredDepth: 6,
            depositIds: ["0xvault"],
          }}
        />,
      );

      expect(
        screen.queryByTestId("btc-confirmation-detail"),
      ).not.toBeInTheDocument();
    });

    it("does not render the detail panel when btcConfirmationDetail is null", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS}
          btcConfirmationDetail={null}
        />,
      );

      expect(
        screen.queryByTestId("btc-confirmation-detail"),
      ).not.toBeInTheDocument();
    });
  });

  describe("peg-in fee warning", () => {
    it("warns about the high fee while the peg-in signing step is active", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SIGN_PEGIN_BTC}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.steps.peginFeeWarning),
      ).toBeInTheDocument();
    });

    it("does not show the fee warning on other steps", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
        />,
      );

      expect(
        screen.queryByText(COPY.deposit.steps.peginFeeWarning),
      ).not.toBeInTheDocument();
    });
  });

  describe("terminal success milestone (terminalMessage)", () => {
    it("shows the terminal message and a Done button without completing the flow", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.RETRIEVE_SECRET}
          canClose={false}
          terminalMessage="Ready to activate."
        />,
      );

      expect(screen.getByText("Ready to activate.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
      // Not the final state: the progress bar is not full.
      expect(screen.getByRole("progressbar")).not.toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    });

    it("enables the Done button even when canClose is false", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.RETRIEVE_SECRET}
          canClose={false}
          terminalMessage="Ready to activate."
        />,
      );

      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });

    it("suppresses the terminal banner when there is an error", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.RETRIEVE_SECRET}
          error="boom"
          terminalMessage="Ready to activate."
        />,
      );

      expect(screen.queryByText("Ready to activate.")).not.toBeInTheDocument();
    });

    it("prefers the final success banner over the terminal message when complete", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.COMPLETED}
          isComplete
          terminalMessage="Ready to activate."
        />,
      );

      expect(screen.queryByText("Ready to activate.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    });
  });
});
