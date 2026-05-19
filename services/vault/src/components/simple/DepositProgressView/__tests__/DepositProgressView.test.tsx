import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { DepositProgressView } from "../DepositProgressView";

const baseProps = {
  error: null,
  isComplete: false,
  isProcessing: false,
  canClose: true,
  canContinueInBackground: false,
  payoutSigningProgress: null,
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

    it("renders the active step with its description", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
        />,
      );

      expect(
        screen.getByText("Awaiting Bitcoin confirmation"),
      ).toBeInTheDocument();
      expect(screen.getByText("(~15 min)")).toBeInTheDocument();
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
    const PEGIN_TX_HASH =
      "1b2c3d4e5f00000000000000000000000000000000000000000000000000000000";
    const FIXED_NOW = new Date("2026-01-01T14:00:00Z").getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders Started at, Est. Remaining, and Bitcoin TX when the active step is AWAIT_BTC_CONFIRMATION", () => {
      const startedAt = new Date("2026-01-01T13:44:00Z").getTime();
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={{
            startedAt,
            peginTxHash: PEGIN_TX_HASH,
          }}
        />,
      );

      expect(screen.getByText("Started at:")).toBeInTheDocument();
      expect(screen.getByText("Est. Remaining:")).toBeInTheDocument();
      expect(screen.getByText("Bitcoin TX:")).toBeInTheDocument();
      expect(screen.getByText(/^~\d+ min$/)).toBeInTheDocument();
    });

    it("counts down Est. Remaining based on elapsed time", () => {
      const elevenMinutesAgo = FIXED_NOW - 11 * 60 * 1000;
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={{
            startedAt: elevenMinutesAgo,
            peginTxHash: PEGIN_TX_HASH,
          }}
        />,
      );

      // 15 expected - 11 elapsed = 4 remaining
      expect(screen.getByText("~4 min")).toBeInTheDocument();
    });

    it("floors Est. Remaining at 0 once the expected wait has elapsed", () => {
      const longAgo = FIXED_NOW - 60 * 60 * 1000;
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={{
            startedAt: longAgo,
            peginTxHash: PEGIN_TX_HASH,
          }}
        />,
      );

      expect(screen.getByText("~0 min")).toBeInTheDocument();
    });

    it("does not render the detail panel for steps other than AWAIT_BTC_CONFIRMATION", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.SUBMIT_WOTS_KEYS}
          btcConfirmationDetail={{
            startedAt: FIXED_NOW,
            peginTxHash: PEGIN_TX_HASH,
          }}
        />,
      );

      expect(screen.queryByText("Started at:")).not.toBeInTheDocument();
      expect(screen.queryByText("Bitcoin TX:")).not.toBeInTheDocument();
    });

    it("does not render the detail panel when btcConfirmationDetail is null", () => {
      render(
        <DepositProgressView
          {...baseProps}
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          btcConfirmationDetail={null}
        />,
      );

      expect(screen.queryByText("Started at:")).not.toBeInTheDocument();
      expect(screen.queryByText("Bitcoin TX:")).not.toBeInTheDocument();
    });
  });
});
