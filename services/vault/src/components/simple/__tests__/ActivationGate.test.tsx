import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

import { ActivationGate } from "../ActivationGate";

vi.mock("../ActivateConfirmationModal", () => ({
  ActivateConfirmationModal: ({
    onConfirm,
    onClose,
    simulateProviderLiveness,
  }: {
    onConfirm: () => void;
    onClose: () => void;
    simulateProviderLiveness?: boolean;
  }) => (
    <div
      data-testid="confirm"
      data-simulated={String(simulateProviderLiveness === true)}
    >
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

  it("proceeds straight to the children after confirming", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    fireEvent.click(getByTestId("confirm-activate"));
    expect(getByTestId("activation-step")).toBeTruthy();
    expect(queryByTestId("confirm")).toBeNull();
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

  it("still renders the confirmation gate when artifact inputs are missing, so the modal can explain the block", () => {
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

  it("probes the real provider unless told the vault is a god-mode demo", () => {
    const real = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div />
      </ActivationGate>,
    );
    expect(real.getByTestId("confirm")).toHaveAttribute(
      "data-simulated",
      "false",
    );
    real.unmount();

    const demo = render(
      <ActivationGate activity={activity()} onClose={vi.fn()} simulatedProvider>
        <div />
      </ActivationGate>,
    );
    expect(demo.getByTestId("confirm")).toHaveAttribute(
      "data-simulated",
      "true",
    );
  });
});
