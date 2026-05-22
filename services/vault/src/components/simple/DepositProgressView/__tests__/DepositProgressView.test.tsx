import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  describe("pre-sign state (no steps completed yet)", () => {
    it("renders the full 11-step list and hides the overall progress bar", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.DERIVE_VAULT_SECRET}
        />,
      );

      expect(
        screen.getByText("Generate secret for the deposit"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Sign and broadcast reveal secret"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/steps completed$/)).not.toBeInTheDocument();
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

  describe("post-sign state (at least one step completed)", () => {
    it("renders the progress bar with the correct fill ratio", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "45");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("renders the 'X of 11 steps completed' pill", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      expect(screen.getByText("5 of 11 steps completed")).toBeInTheDocument();
    });

    it("hides all completed step labels (rows are collapsed into the pill)", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      expect(
        screen.queryByText("Generate secret for the deposit"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Sign and broadcast BTC pre-pegIn transaction"),
      ).not.toBeInTheDocument();
    });

    it("renders the label of the active step", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      expect(
        screen.getByText("Awaiting Bitcoin confirmation"),
      ).toBeInTheDocument();
    });

    it("renders pending steps as label-only (no descriptions)", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          payoutSigningProgress={{ completed: 0, totalClaimers: 3 }}
        />,
      );

      expect(screen.getByText("Sign payout transactions")).toBeInTheDocument();
      expect(screen.queryByText("(0 of 3)")).not.toBeInTheDocument();
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
        screen.getByText("Sign the peg-in BTC transaction"),
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
        screen.getByText("Sign the peg-in BTC transaction"),
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
        screen.getByText("Sign the peg-in BTC transaction"),
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
    it("reports 11 of 11 in the pill and fills the progress bar", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.ACTIVATE_VAULT}
          isComplete
        />,
      );

      expect(screen.getByText("11 of 11 steps completed")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    });

    it("reports 11 of 11 when currentStep is COMPLETED", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.COMPLETED}
          isComplete
        />,
      );

      expect(screen.getByText("11 of 11 steps completed")).toBeInTheDocument();
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

    it("renders the confirmation detail when the active step is AWAIT_BTC_CONFIRMATION", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={{
            startedAt: NOW,
            prePeginTxid: PRE_PEGIN_TXID,
            requiredDepth: 6,
          }}
        />,
      );

      expect(screen.getByTestId("btc-confirmation-detail")).toBeInTheDocument();
    });

    it("does not render the detail panel for steps other than AWAIT_BTC_CONFIRMATION", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
          btcConfirmationDetail={{
            startedAt: NOW,
            prePeginTxid: PRE_PEGIN_TXID,
            requiredDepth: 6,
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
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={null}
        />,
      );

      expect(
        screen.queryByTestId("btc-confirmation-detail"),
      ).not.toBeInTheDocument();
    });
  });
});
