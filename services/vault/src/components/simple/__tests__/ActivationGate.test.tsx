import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VaultActivity } from "@/types/activity";

import { ActivationGate } from "../ActivationGate";

vi.mock("../ActivateConfirmationModal", () => ({
  ActivateConfirmationModal: ({
    onConfirm,
    onClose,
    onDownloadArtifacts,
    downloadCompletedAt,
  }: {
    onConfirm: () => void;
    onClose: () => void;
    onDownloadArtifacts: () => void;
    downloadCompletedAt?: number;
  }) => (
    <div data-testid="confirm">
      <span data-testid="confirm-tick">{String(downloadCompletedAt ?? 0)}</span>
      <button type="button" data-testid="confirm-activate" onClick={onConfirm}>
        activate
      </button>
      <button
        type="button"
        data-testid="confirm-download"
        onClick={onDownloadArtifacts}
      >
        download
      </button>
      <button type="button" data-testid="confirm-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock("@/components/deposit/ArtifactDownloadModal", () => ({
  ArtifactDownloadModal: ({
    onComplete,
    onClose,
  }: {
    onComplete: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="artifact">
      <button
        type="button"
        data-testid="artifact-complete"
        onClick={onComplete}
      >
        complete
      </button>
      <button type="button" data-testid="artifact-close" onClick={onClose}>
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

  it("opens artifact download from the gate and bumps the tick on completion", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    expect(getByTestId("confirm-tick").textContent).toBe("0");

    fireEvent.click(getByTestId("confirm-download"));
    expect(getByTestId("artifact")).toBeTruthy();

    fireEvent.click(getByTestId("artifact-complete"));
    expect(queryByTestId("artifact")).toBeNull();
    expect(getByTestId("confirm-tick").textContent).toBe("1");
  });

  it("does not open artifact download when artifact inputs are missing", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate
        activity={activity({ peginTxHash: undefined })}
        onClose={vi.fn()}
      >
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    fireEvent.click(getByTestId("confirm-download"));
    expect(queryByTestId("artifact")).toBeNull();
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
});
