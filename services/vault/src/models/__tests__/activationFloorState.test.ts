// Behaviour of the activation FLOOR inside the pegin state machine: a VERIFIED
// vault waiting out `verifiedAt + peginActivationDelay` must lose the Activate
// action WITHOUT being presented as expired.

import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { PeginAction, getPeginState } from "@/models/peginStateMachine";

const VERIFIED = {
  contractStatus: ContractStatus.VERIFIED,
  transactionsReady: true,
} as const;

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
});
