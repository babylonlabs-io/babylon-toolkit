/**
 * The redeem confirm screen: what it says about the grace window, and when it
 * lets the depositor start the secret derivation.
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
import {
  type ClaimExpiredWindow,
  ContractStatus,
  getClaimExpiredModalWindow,
  getPeginState,
  type PeginState,
} from "@/models/peginStateMachine";

import { ClaimExpiredVaultConfirmContent } from "../ClaimExpiredVaultConfirmContent";

function renderConfirm(
  claimWindow: ClaimExpiredWindow | undefined,
  onConfirm = vi.fn(),
) {
  const view = render(
    <ClaimExpiredVaultConfirmContent
      claimWindow={claimWindow}
      claiming={false}
      error={null}
      errorTerminal={false}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );
  return { ...view, onConfirm };
}

function confirmButton() {
  return screen.getByRole("button", {
    name: COPY.deposit.claimExpired.confirmButton,
  });
}

beforeEach(() => {
  gateMock.value = { protocol: null, aave: null };
});

describe("ClaimExpiredVaultConfirmContent", () => {
  it("states the time left and enables Redeem while the window is open", () => {
    // 7_200 blocks at 12s each is exactly one day.
    const { onConfirm } = renderConfirm({
      state: "open",
      blocksRemaining: 7_200,
    });

    expect(
      screen.getByText(COPY.deposit.claimExpired.deadline("~1 day")),
    ).toBeInTheDocument();
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps Redeem enabled and says the deadline is unknown when it was not read", () => {
    renderConfirm(undefined);

    expect(
      screen.getByText(COPY.deposit.claimExpired.deadlineUnknown),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it("switches to the closed explanation and disables Redeem when the window closes while open", () => {
    const { rerender, onConfirm } = renderConfirm({
      state: "open",
      blocksRemaining: 1,
    });

    rerender(
      <ClaimExpiredVaultConfirmContent
        claimWindow={{ state: "closed" }}
        claiming={false}
        error={null}
        errorTerminal={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText(COPY.deposit.claimExpired.windowClosedNotice),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.claimExpired.deadlineUnknown),
    ).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables Redeem once the chain reports the vault already redeemed", () => {
    renderConfirm({ state: "redeemed" });

    expect(
      screen.getByText(COPY.deposit.claimExpired.errors.alreadyRedeemed),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("disables Redeem and explains why while the protocol is paused", () => {
    gateMock.value = { protocol: "paused", aave: null };
    renderConfirm({ state: "open", blocksRemaining: 7_200 });

    expect(screen.getByText(COPY.pegin.claimExpiredPaused)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

// The modal hands the confirm screen `getClaimExpiredModalWindow` of the live
// polling state; these drive that handoff from real state-machine output.
describe("ClaimExpiredVaultConfirmContent — live state handoff", () => {
  function sweptExpired(claimExpiredWindow?: ClaimExpiredWindow) {
    return getPeginState(ContractStatus.EXPIRED, {
      peginSweptWhileExpired: true,
      canClaimExpired: claimExpiredWindow?.state !== "redeemed",
      claimExpiredWindow,
    });
  }

  function renderFromState(state: PeginState, onConfirm = vi.fn()) {
    const element = (next: PeginState) => (
      <ClaimExpiredVaultConfirmContent
        claimWindow={getClaimExpiredModalWindow(next)}
        claiming={false}
        error={null}
        errorTerminal={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    const view = render(element(state));
    return {
      onConfirm,
      advanceTo: (next: PeginState) => view.rerender(element(next)),
    };
  }

  it("stays disabled when the indexer catches up to a redeem the chain already reported", () => {
    const { advanceTo, onConfirm } = renderFromState(
      sweptExpired({ state: "redeemed" }),
    );
    expect(confirmButton()).toBeDisabled();

    advanceTo(getPeginState(ContractStatus.REDEEMED));

    expect(confirmButton()).toBeDisabled();
    expect(
      screen.getByText(COPY.deposit.claimExpired.errors.alreadyRedeemed),
    ).toBeInTheDocument();
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables Redeem when the indexer reports the vault redeemed straight from an open window", () => {
    const { advanceTo } = renderFromState(
      sweptExpired({ state: "open", blocksRemaining: 7_200 }),
    );
    expect(confirmButton()).toBeEnabled();

    advanceTo(getPeginState(ContractStatus.REDEEMED));

    expect(confirmButton()).toBeDisabled();
    expect(
      screen.getByText(COPY.deposit.claimExpired.errors.alreadyRedeemed),
    ).toBeInTheDocument();
  });

  it("leaves an unknown window on an expired vault enabled", () => {
    renderFromState(sweptExpired(undefined));

    expect(
      screen.getByText(COPY.deposit.claimExpired.deadlineUnknown),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });
});
