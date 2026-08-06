/**
 * Tests for the escape-hatch confirm screen's gating.
 *
 * Confirming reveals the HTLC secret irreversibly, so the two directions of
 * the application-status read are asymmetric on purpose: a CONFIRMED inactive
 * application withholds the action (the registry would reject it), while an
 * UNKNOWN status must not — over-blocking strands a depositor whose peg-in is
 * already swept, and the pre-broadcast simulation still refuses to sign.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { Hex } from "viem";
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

const applicationActiveMock = vi.hoisted(() => ({
  value: undefined as boolean | undefined,
}));
vi.mock("@/hooks/useVaultApplicationActive", () => ({
  useVaultApplicationActive: () => applicationActiveMock.value,
}));

import { COPY } from "@/copy";

import { EmergencyWithdrawConfirmContent } from "../EmergencyWithdrawConfirmContent";

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;

function renderConfirm() {
  return render(
    <EmergencyWithdrawConfirmContent
      stuckStateDetected
      vaultId={VAULT_ID}
      withdrawing={false}
      error={null}
      errorTerminal={false}
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
  applicationActiveMock.value = true;
});

describe("EmergencyWithdrawConfirmContent — application-status gate", () => {
  it("allows withdrawing once acknowledged and the application is active", () => {
    renderConfirm();
    acknowledge();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeEnabled();
    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.applicationInactive),
    ).not.toBeInTheDocument();
  });

  it("withholds the action and explains why when the application is inactive", () => {
    applicationActiveMock.value = false;
    renderConfirm();
    acknowledge();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeDisabled();
    expect(
      screen.getByText(COPY.deposit.emergencyWithdraw.applicationInactive),
    ).toBeInTheDocument();
  });

  it("still allows withdrawing while the application status is unknown", () => {
    // Loading or a failed read. Fail OPEN: this is the only recovery left for
    // a swept peg-in, so an RPC blip must not take it away.
    applicationActiveMock.value = undefined;
    renderConfirm();
    acknowledge();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeEnabled();
    expect(
      screen.queryByText(COPY.deposit.emergencyWithdraw.applicationInactive),
    ).not.toBeInTheDocument();
  });

  it("keeps the action withheld under a protocol-scope pause", () => {
    // The pre-existing governance gate must survive the new one.
    gateMock.value = { protocol: "paused", aave: null };
    renderConfirm();
    acknowledge();

    expect(screen.getByTestId("emergency-withdraw-button")).toBeDisabled();
  });

  it("explains the withheld action under a protocol-scope pause", () => {
    // The disabled button used to be the whole story: the copy existed but was
    // only set by the click handler behind the button the pause had already
    // disabled, so a depositor who believes their BTC is stuck saw a dead
    // control with no reason given.
    gateMock.value = { protocol: "paused", aave: null };
    renderConfirm();

    expect(
      screen.getByText(COPY.pegin.activateAndRedeemPaused),
    ).toBeInTheDocument();
  });

  it("does not show the pause explanation when nothing is paused", () => {
    gateMock.value = { protocol: null, aave: null };
    renderConfirm();

    expect(
      screen.queryByText(COPY.pegin.activateAndRedeemPaused),
    ).not.toBeInTheDocument();
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
