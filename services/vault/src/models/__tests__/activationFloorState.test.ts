// Behaviour of the activation FLOOR inside the pegin state machine: a VERIFIED
// vault waiting out `verifiedAt + peginActivationDelay` must lose the Activate
// action WITHOUT being presented as expired.

import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import {
  LocalStorageStatus,
  PeginAction,
  getPeginState,
} from "@/models/peginStateMachine";

const VERIFIED = { contractStatus: ContractStatus.VERIFIED } as const;

describe("activation floor in getPeginState", () => {
  it("offers Activate when the floor is not gating", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: undefined,
    });

    expect(state.availableActions).toContain(PeginAction.ACTIVATE_VAULT);
    expect(state.message).toBe(COPY.pegin.messages.readyToActivate);
  });

  it("strips Activate while blocks remain", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.availableActions).not.toContain(PeginAction.ACTIVATE_VAULT);
  });

  it("keeps the vault reading as waiting, never as expired", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: 150,
    });

    // The `warning` variant is what suppresses the progress step and renders
    // the Expired badge — a healthy waiting vault must not get it.
    expect(state.displayVariant).toBe("pending");
    expect(state.displayLabel).not.toBe(COPY.pegin.labels.EXPIRED);
    // And it must not claim readiness while the button is disabled.
    expect(state.displayLabel).toBe(
      COPY.pegin.labels.AWAITING_ACTIVATION_WINDOW,
    );
  });

  it("quotes the remaining blocks and an approximate duration", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.message).toBe(
      COPY.pegin.messages.activationWindowOpening(150, 30),
    );
  });

  it("strips Activate but quotes no numbers when the remainder is unknown", () => {
    // null = a chain read failed. Fail closed, but don't invent a duration.
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: null,
    });

    expect(state.availableActions).not.toContain(PeginAction.ACTIVATE_VAULT);
    expect(state.message).toBe(COPY.pegin.messages.activationWindowTooltip);
    expect(state.displayVariant).toBe("pending");
  });

  it("retains the remaining count on the state for the action layer", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: 42,
    });

    expect(state.activationFloorBlocksRemaining).toBe(42);
  });

  it("lets an expired deadline win over the floor", () => {
    // Both bounds claiming the vault at once is contradictory; expiry is
    // terminal, so it must not be masked by a transient waiting state.
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationDeadlinePassed: true,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.displayLabel).toBe(COPY.pegin.labels.EXPIRED);
    expect(state.availableActions).not.toContain(PeginAction.ACTIVATE_VAULT);
  });
  it("leaves ACTIVATE_AND_REDEEM available while the floor gates ACTIVATE_VAULT", () => {
    // The asymmetry is deliberate and load-bearing. On-chain,
    // `_requireActivationDelayElapsed` guards `activateVaultWithSecret` only;
    // `activateVaultWithSecretAndRedeem` is exempt because it mints no vaultBTC.
    // A refactor that "mirrors" the deadline filter (which strips BOTH) would
    // remove the escape hatch the Activation-incomplete state advertises, for a
    // call the contract would have accepted.
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      htlcSpentByPeginTx: true,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.availableActions).not.toContain(PeginAction.ACTIVATE_VAULT);
    expect(state.availableActions).toContain(PeginAction.ACTIVATE_AND_REDEEM);
  });

  it("does not mark a Processing vault as floor-gated", () => {
    // VERIFIED + CONFIRMED has no action because activation was already
    // submitted. Tagging it with the floor would put a disabled "Activate"
    // and an "opens shortly" tooltip beside a "Processing" badge — and, via
    // getActionStatus, replace its View-details control.
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      localStatus: LocalStorageStatus.CONFIRMED,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.activationFloorBlocksRemaining).toBeUndefined();
  });

  it("does not mark a deadline-expired vault as floor-gated", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationDeadlinePassed: true,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.activationFloorBlocksRemaining).toBeUndefined();
  });
  it("puts the wait in the always-visible subtext, not only the tooltip", () => {
    // `message` renders behind an info icon; a depositor who never hovers — or
    // is on touch — would see a greyed Activate and no reason for it.
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: 150,
    });

    expect(state.inlineSubtext).toBe(
      COPY.pegin.messages.activationWindowSubtext(150, 30),
    );
  });

  it("still shows a subtext when the remaining time is unknown", () => {
    const state = getPeginState(VERIFIED.contractStatus, {
      transactionsReady: true,
      activationFloorBlocksRemaining: null,
    });

    expect(state.inlineSubtext).toBe(
      COPY.pegin.messages.activationWindowSubtextUnknown,
    );
  });
});
