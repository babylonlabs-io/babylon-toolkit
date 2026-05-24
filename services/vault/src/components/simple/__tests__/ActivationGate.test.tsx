import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

import { ActivationGate } from "../ActivationGate";

vi.mock("../ActivateConfirmationModal", () => ({
  ActivateConfirmationModal: ({
    onConfirm,
    onClose,
  }: {
    onConfirm: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="confirm">
      <button type="button" data-testid="confirm-activate" onClick={onConfirm}>
        activate
      </button>
      <button type="button" data-testid="confirm-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

function activity(overrides?: Partial<VaultActivity>): VaultActivity {
  return {
    id: "0xvault",
    providers: [{ id: "0xprovider" }],
    peginTxHash: "0xpegin",
    depositorBtcPubkey: "0xpk",
    unsignedPrePeginTx: "0xtx",
    ...overrides,
  } as unknown as VaultActivity;
}

describe("ActivationGate", () => {
  it("shows the confirmation gate, not the children, before confirming", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    expect(getByTestId("confirm")).toBeTruthy();
    expect(queryByTestId("activation-step")).toBeNull();
  });

  it("renders the children only after the user confirms", () => {
    const { getByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    fireEvent.click(getByTestId("confirm-activate"));
    expect(getByTestId("activation-step")).toBeTruthy();
  });

  it("forwards close from the confirmation gate", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <ActivationGate activity={activity()} onClose={onClose}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    fireEvent.click(getByTestId("confirm-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still renders the confirmation gate when artifact inputs are missing so the user must acknowledge the risk", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate
        activity={activity({ peginTxHash: undefined })}
        onClose={vi.fn()}
      >
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    expect(getByTestId("confirm")).toBeTruthy();
    expect(queryByTestId("activation-step")).toBeNull();
  });
});
