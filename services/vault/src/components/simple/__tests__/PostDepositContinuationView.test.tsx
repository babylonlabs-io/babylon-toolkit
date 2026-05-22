import { fireEvent, render } from "@testing-library/react";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PeginAction } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { PostDepositContinuationView } from "../PostDepositContinuationView";

const mockUseDepositPollingResult = vi.hoisted(() => vi.fn());
const mockRefetch = vi.hoisted(() => vi.fn());
const mockHasArtifactsDownloaded = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  useDepositPollingResult: mockUseDepositPollingResult,
  usePeginPolling: () => ({ refetch: mockRefetch }),
}));

vi.mock("@/utils/artifactDownloadStorage", () => ({
  hasArtifactsDownloaded: mockHasArtifactsDownloaded,
}));

vi.mock("@/hooks/deposit/depositFlowSteps", () => ({
  DepositFlowStep: {
    AWAIT_BTC_CONFIRMATION: "AWAIT_BTC_CONFIRMATION",
    ACTIVATE_VAULT: "ACTIVATE_VAULT",
    COMPLETED: "COMPLETED",
  },
}));

vi.mock("@/models/peginStateMachine", () => ({
  PeginAction: {
    SUBMIT_WOTS_KEY: "SUBMIT_WOTS_KEY",
    SIGN_PAYOUT_TRANSACTIONS: "SIGN_PAYOUT_TRANSACTIONS",
    ACTIVATE_VAULT: "ACTIVATE_VAULT",
    NONE: "NONE",
  },
  getPeginDisplayStep: vi.fn(() => "AWAIT_BTC_CONFIRMATION"),
}));

vi.mock("@/copy", () => ({
  COPY: {
    deposit: {
      resume: { activationSuccessMessage: "Deposit successfully submitted!" },
    },
    common: {
      somethingWentWrong: { body: "Please close this and try again." },
    },
  },
}));

vi.mock("../DepositProgressView", () => ({
  DepositProgressView: ({
    currentStep,
    error,
    isComplete,
    onClose,
  }: {
    currentStep: string;
    error?: string | null;
    isComplete?: boolean;
    onClose: () => void;
  }) => (
    <div data-testid="progress-view">
      <span data-testid="step">{String(currentStep)}</span>
      <span data-testid="error">{error ?? ""}</span>
      <span data-testid="complete">{String(!!isComplete)}</span>
      <button type="button" data-testid="progress-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

function resumeMock(testId: string) {
  return ({
    onSuccess,
    onClose,
  }: {
    onSuccess: () => void;
    onClose: () => void;
  }) => (
    <div data-testid={testId}>
      <button
        type="button"
        data-testid={`${testId}-success`}
        onClick={onSuccess}
      >
        success
      </button>
      <button type="button" data-testid={`${testId}-close`} onClick={onClose}>
        close
      </button>
    </div>
  );
}

vi.mock("../ResumeDepositContent", () => ({
  ResumeWotsContent: resumeMock("wots"),
  ResumeSignContent: resumeMock("payout"),
  ResumeActivationContent: resumeMock("activate"),
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

function activityWithId(id: string): VaultActivity {
  return {
    id,
    collateral: { amount: "0.01", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    displayLabel: "Pending",
    peginTxHash: "0xpegintx",
    unsignedPrePeginTx: "0xindexertx",
    depositorBtcPubkey: "0xdepositorpk",
  } as unknown as VaultActivity;
}

function resultWith(opts: {
  availableActions: string[];
  displayVariant?: "pending" | "active" | "inactive" | "warning";
  message?: string;
}) {
  return {
    depositId: "x",
    loading: false,
    error: null,
    peginState: {
      contractStatus: 0,
      availableActions: opts.availableActions,
      displayVariant: opts.displayVariant ?? "pending",
      displayLabel: "x",
      message: opts.message,
    },
    isOwnedByCurrentWallet: true,
  };
}

const ETH = "0xeth" as Address;

function renderView(
  overrides: Partial<{
    vaultIds: Hex[];
    activities: VaultActivity[];
    btcPublicKey: string | undefined;
    onClose: () => void;
  }> = {},
) {
  const vaultIds = overrides.vaultIds ?? ["0xvault0" as Hex];
  return render(
    <PostDepositContinuationView
      vaultIds={vaultIds}
      activities={
        overrides.activities ?? vaultIds.map((id) => activityWithId(id))
      }
      depositorEthAddress={ETH}
      btcPublicKey={
        "btcPublicKey" in overrides ? overrides.btcPublicKey : "btcpub"
      }
      onClose={overrides.onClose ?? vi.fn()}
    />,
  );
}

describe("PostDepositContinuationView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasArtifactsDownloaded.mockReturnValue(false);
  });

  it("waits while the vault has no actionable step", () => {
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.NONE] }),
    );
    const { getByTestId, queryByTestId } = renderView();
    expect(getByTestId("progress-view")).toBeTruthy();
    expect(queryByTestId("wots")).toBeNull();
    expect(queryByTestId("payout")).toBeNull();
    expect(queryByTestId("activate")).toBeNull();
  });

  it("auto-mounts WOTS submission when the VP needs the WOTS key", () => {
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.SUBMIT_WOTS_KEY] }),
    );
    expect(renderView().getByTestId("wots")).toBeTruthy();
  });

  it("auto-mounts payout signing when the VP is ready for signatures", () => {
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS] }),
    );
    expect(renderView().getByTestId("payout")).toBeTruthy();
  });

  it("waits (no payout) when the BTC public key is unavailable", () => {
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS] }),
    );
    const { queryByTestId, getByTestId } = renderView({
      btcPublicKey: undefined,
    });
    expect(queryByTestId("payout")).toBeNull();
    expect(getByTestId("progress-view")).toBeTruthy();
  });

  it("auto-mounts activation when verified and artifacts already downloaded", () => {
    mockHasArtifactsDownloaded.mockReturnValue(true);
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.ACTIVATE_VAULT] }),
    );
    const { getByTestId, queryByTestId } = renderView();
    expect(getByTestId("activate")).toBeTruthy();
    expect(queryByTestId("artifact")).toBeNull();
  });

  it("shows the artifact download before activation, then activates on complete", () => {
    mockHasArtifactsDownloaded.mockReturnValue(false);
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.ACTIVATE_VAULT] }),
    );
    const { getByTestId, queryByTestId } = renderView();
    expect(getByTestId("artifact")).toBeTruthy();
    expect(queryByTestId("activate")).toBeNull();

    fireEvent.click(getByTestId("artifact-complete"));

    expect(getByTestId("activate")).toBeTruthy();
    expect(queryByTestId("artifact")).toBeNull();
  });

  it("closes the modal after the last vault activates", () => {
    mockHasArtifactsDownloaded.mockReturnValue(true);
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.ACTIVATE_VAULT] }),
    );
    const onClose = vi.fn();
    fireEvent.click(renderView({ onClose }).getByTestId("activate-success"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("advances to the next vault after the first vault activates", () => {
    mockHasArtifactsDownloaded.mockReturnValue(true);
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.ACTIVATE_VAULT] }),
    );
    const { getByTestId } = renderView({
      vaultIds: ["0xvault0" as Hex, "0xvault1" as Hex],
      activities: [activityWithId("0xvault0"), activityWithId("0xvault1")],
      onClose: vi.fn(),
    });
    // First vault: activation success advances; the second vault then activates.
    fireEvent.click(getByTestId("activate-success"));
    expect(getByTestId("activate")).toBeTruthy();
  });

  it("surfaces a closeable error on a warning state with no signing popup", () => {
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({
        availableActions: [PeginAction.NONE],
        displayVariant: "warning",
        message: "This deposit has expired.",
      }),
    );
    const { getByTestId, queryByTestId } = renderView();
    expect(getByTestId("error").textContent).toBe("This deposit has expired.");
    expect(queryByTestId("wots")).toBeNull();
    expect(queryByTestId("payout")).toBeNull();
    expect(queryByTestId("activate")).toBeNull();
  });

  it("closing during the wait fires no signing popup", () => {
    mockUseDepositPollingResult.mockReturnValue(
      resultWith({ availableActions: [PeginAction.NONE] }),
    );
    const onClose = vi.fn();
    fireEvent.click(renderView({ onClose }).getByTestId("progress-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a completed view when there are no vaults to continue", () => {
    mockUseDepositPollingResult.mockReturnValue(undefined);
    const { getByTestId } = renderView({ vaultIds: [], activities: [] });
    expect(getByTestId("step").textContent).toBe("COMPLETED");
    expect(getByTestId("complete").textContent).toBe("true");
  });
});
