import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    window.localStorage.clear();
  });

  function markDownloaded(vaultId: string) {
    window.localStorage.setItem(
      `tbv:artifacts-downloaded:${vaultId.toLowerCase()}`,
      "true",
    );
  }

  it("auto-opens the artifact download modal when artifacts haven't been downloaded yet", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    expect(getByTestId("artifact")).toBeTruthy();
    expect(queryByTestId("confirm")).toBeNull();
    expect(queryByTestId("activation-step")).toBeNull();
  });

  it("falls through to the confirmation gate when the auto-opened download modal is dismissed", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    fireEvent.click(getByTestId("artifact-close"));
    expect(queryByTestId("artifact")).toBeNull();
    expect(getByTestId("confirm")).toBeTruthy();
  });

  it("shows the confirmation gate directly when artifacts were already downloaded", () => {
    markDownloaded("0xvault");
    const { getByTestId, queryByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    expect(getByTestId("confirm")).toBeTruthy();
    expect(queryByTestId("artifact")).toBeNull();
  });

  it("renders the children only after the user confirms", () => {
    markDownloaded("0xvault");
    const { getByTestId } = render(
      <ActivationGate activity={activity()} onClose={vi.fn()}>
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    fireEvent.click(getByTestId("confirm-activate"));
    expect(getByTestId("activation-step")).toBeTruthy();
  });

  it("opens artifact download from the gate and bumps the tick on completion", () => {
    markDownloaded("0xvault");
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

  it("does not auto-open artifact download when artifact inputs are missing", () => {
    const { getByTestId, queryByTestId } = render(
      <ActivationGate
        activity={activity({ peginTxHash: undefined })}
        onClose={vi.fn()}
      >
        <div data-testid="activation-step" />
      </ActivationGate>,
    );
    expect(queryByTestId("artifact")).toBeNull();
    expect(getByTestId("confirm")).toBeTruthy();

    fireEvent.click(getByTestId("confirm-download"));
    expect(queryByTestId("artifact")).toBeNull();
  });

  it("forwards close from the confirmation gate", () => {
    markDownloaded("0xvault");
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
