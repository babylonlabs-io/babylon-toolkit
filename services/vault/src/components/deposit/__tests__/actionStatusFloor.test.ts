// A vault held by the activation floor must render a DISABLED Activate with
// the wait explained — not the neutral "View details" that a plain no-action
// state produces, which would make the wait silent and look like a stall.

import { describe, expect, it } from "vitest";

import { getActionStatus } from "@/components/deposit/actionStatus";
import type { DepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { ContractStatus, PeginAction } from "@/models/peginStateMachine";

function makeResult(
  peginStateOverrides: Record<string, unknown>,
  resultOverrides: Record<string, unknown> = {},
): DepositPollingResult {
  return {
    peginState: {
      contractStatus: ContractStatus.VERIFIED,
      displayLabel: COPY.pegin.labels.READY_TO_ACTIVATE,
      displayVariant: "pending",
      availableActions: [],
      ...peginStateOverrides,
    },
    isOwnedByCurrentWallet: true,
    error: undefined,
    depositorBtcPubkey: undefined,
    ...resultOverrides,
  } as unknown as DepositPollingResult;
}

describe("getActionStatus with the activation floor", () => {
  it("disables Activate and explains the wait while the floor gates", () => {
    const status = getActionStatus(
      makeResult({ activationFloorBlocksRemaining: 150 }),
    );

    expect(status.type).toBe("disabled");
    if (status.type !== "disabled") return;
    expect(status.action?.action).toBe(PeginAction.ACTIVATE_VAULT);
    expect(status.tooltip).toBe(COPY.pegin.messages.activationWindowTooltip);
  });

  it("disables Activate when the remainder is unknown (fail closed)", () => {
    const status = getActionStatus(
      makeResult({ activationFloorBlocksRemaining: null }),
    );

    expect(status.type).toBe("disabled");
  });

  it("falls through to noAction when the floor is not gating", () => {
    const status = getActionStatus(
      makeResult({ activationFloorBlocksRemaining: undefined }),
    );

    expect(status.type).toBe("noAction");
  });

  it("falls through to noAction at remaining 0 (window open)", () => {
    const status = getActionStatus(
      makeResult({ activationFloorBlocksRemaining: 0 }),
    );

    expect(status.type).toBe("noAction");
  });

  it("lets wallet-ownership disabling win, so an unowned vault shows no countdown", () => {
    const status = getActionStatus(
      makeResult(
        { activationFloorBlocksRemaining: 150 },
        { isOwnedByCurrentWallet: false, depositorBtcPubkey: "02ab" },
      ),
    );

    expect(status.type).toBe("disabled");
    if (status.type !== "disabled") return;
    expect(status.tooltip).not.toBe(
      COPY.pegin.messages.activationWindowTooltip,
    );
  });

  it("reports a polling error as noAction rather than as a floor wait", () => {
    const status = getActionStatus(
      makeResult(
        { activationFloorBlocksRemaining: 150 },
        { error: new Error("polling failed") },
      ),
    );

    expect(status.type).toBe("noAction");
  });
});
