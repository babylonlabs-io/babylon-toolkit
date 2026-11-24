/**
 * Tests for the escape-hatch confirm screen: which body it shows for the
 * caller's stuck proof, when it adds the split warning, and its gating.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gateMock = vi.hoisted(() => ({
  value: { protocol: null, aave: null } as {
    protocol: string | null;
    aave: string | null;
  },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { COPY } from "@/copy";

import { EmergencyWithdrawConfirmContent } from "../EmergencyWithdrawConfirmContent";
import type { WithdrawStuckProof } from "../stuckProof";

function renderConfirm(
  stuckProof: WithdrawStuckProof = "proven",
  splitProtectionLost = false,
) {
  return render(
    <EmergencyWithdrawConfirmContent
      stuckProof={stuckProof}
      splitProtectionLost={splitProtectionLost}
      withdrawing={false}
      error={null}
      errorTerminal={false}
      errorOutcomeUnknown={false}
      errorWithdrawUnconfirmed={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

/** The confirm button only ever enables after the risk acknowledgement. */
function acknowledge() {
  fireEvent.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  gateMock.value = { protocol: null, aave: null };
});

describe("EmergencyWithdrawConfirmContent — body per stuck proof", () => {
  it("shows the stuck body for a vault proven stuck", () => {
    renderConfirm("proven");

    expect(
      screen.getByText(COPY.deposit.emergencyWithdraw.bodyStuck),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.bodyNotProven),
    ).not.toBeInTheDocument();
  });

  it("shows the not-proven body, never the stuck one, for a failed activation", () => {
    renderConfirm("not-proven");

    expect(
      screen.getByText(COPY.deposit.emergencyWithdraw.bodyNotProven),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.bodyStuck),
    ).not.toBeInTheDocument();
  });

  it("warns about the lost split protection for a not-proven withdraw that removes it", () => {
    renderConfirm("not-proven", true);

    expect(
      screen.getByText(COPY.deposit.emergencyWithdraw.splitProtectionWarning),
    ).toBeInTheDocument();
  });

  it("does not warn about split protection when the withdraw keeps it", () => {
    renderConfirm("not-proven", false);

    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.splitProtectionWarning),
    ).not.toBeInTheDocument();
  });

  it("does not warn about split protection for a vault proven stuck", () => {
    renderConfirm("proven", true);

    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.splitProtectionWarning),
    ).not.toBeInTheDocument();
  });
});

describe("EmergencyWithdrawConfirmContent — gating", () => {
  it("allows withdrawing once acknowledged", () => {
    renderConfirm();
    acknowledge();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeEnabled();
  });

  it("withholds the action until the risk is acknowledged", () => {
    renderConfirm();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeDisabled();
  });

  it.each<WithdrawStuckProof>(["proven", "not-proven"])(
    "keeps the action withheld and explains why under a protocol-scope pause (%s)",
    (stuckProof) => {
      gateMock.value = { protocol: "paused", aave: null };
      renderConfirm(stuckProof);
      acknowledge();

      expect(screen.getByTestId("emergency-withdraw-button")).toBeDisabled();
      expect(
        screen.getByText(COPY.pegin.activateAndRedeemPaused),
      ).toBeInTheDocument();
    },
  );

  it("does not show the pause explanation when nothing is paused", () => {
    renderConfirm();

    expect(
      screen.queryByText(COPY.pegin.activateAndRedeemPaused),
    ).not.toBeInTheDocument();
  });

  it("shows a withdraw that may have been broadcast as a status-unknown warning with the action disabled and no Retry", () => {
    render(
      <EmergencyWithdrawConfirmContent
        stuckProof="proven"
        splitProtectionLost={false}
        withdrawing={false}
        error="The send may have reached the network"
        errorTerminal={false}
        errorOutcomeUnknown={true}
        errorWithdrawUnconfirmed={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    acknowledge();

    expect(
      screen.getByText(COPY.deposit.errors.sendOutcomeUnknown.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.errors.sendOutcomeUnknown.body),
    ).toBeInTheDocument();
    // The body comes from the flag, not from matching the error string.
    expect(
      screen.queryByText("The send may have reached the network"),
    ).not.toBeInTheDocument();
    // Callout gives the error variant role alert; the warning is a status.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const button = screen.getByTestId("emergency-withdraw-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(
      COPY.deposit.emergencyWithdraw.confirmButton,
    );
  });

  it("shows an unconfirmed withdraw's own message in the status-unknown warning", () => {
    render(
      <EmergencyWithdrawConfirmContent
        stuckProof="proven"
        splitProtectionLost={false}
        withdrawing={false}
        error="Withdraw mined without a redeem log"
        errorTerminal={false}
        errorOutcomeUnknown={true}
        errorWithdrawUnconfirmed={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Withdraw mined without a redeem log"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.errors.sendOutcomeUnknown.body),
    ).not.toBeInTheDocument();
    acknowledge();
    expect(
      screen.getByText(COPY.deposit.errors.sendOutcomeUnknown.title),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const button = screen.getByTestId("emergency-withdraw-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(
      COPY.deposit.emergencyWithdraw.confirmButton,
    );
  });

  it("offers Retry after a withdraw that failed", () => {
    render(
      <EmergencyWithdrawConfirmContent
        stuckProof="proven"
        splitProtectionLost={false}
        withdrawing={false}
        error="Transaction reverted"
        errorTerminal={false}
        errorOutcomeUnknown={false}
        errorWithdrawUnconfirmed={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    acknowledge();

    expect(
      screen.queryByText(COPY.deposit.errors.sendOutcomeUnknown.title),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Transaction reverted");
    const button = screen.getByTestId("emergency-withdraw-button");
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent(
      COPY.deposit.emergencyWithdraw.retryButton,
    );
  });

  it("is not affected by an application-scope pause", () => {
    // `isActivateAndRedeemBlocked` is protocol-scope only; an aave pause must
    // neither withhold the exit nor render the protocol-pause callout.
    gateMock.value = { protocol: null, aave: "paused" };
    renderConfirm();
    acknowledge();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeEnabled();
    expect(
      screen.queryByText(COPY.pegin.activateAndRedeemPaused),
    ).not.toBeInTheDocument();
  });
});
