import { fireEvent, render, screen } from "@testing-library/react";
import {
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIFACT_RECEIPT_VERSION,
  normalizePeginTxid,
  saveArtifactDownloadReceipt,
  saveGraphMismatch,
} from "@/utils/artifactDownloadStorage";

import { ActivateConfirmationModal } from "../ActivateConfirmationModal";

const cardCancelSpy = vi.hoisted(() => vi.fn());
const cardDownloadSpy = vi.hoisted(() => vi.fn());
const viewport = vi.hoisted(() => ({ isMobile: false }));
// Mutable so a test can move the probe's verdict and rerender; `calls` pins
// what the modal hands the hook.
const liveness = vi.hoisted(() => ({
  status: "reachable" as string,
  retry: vi.fn(),
  calls: [] as Array<[string | undefined, string, boolean]>,
}));
vi.mock("@/hooks/deposit/useVpLiveness", () => ({
  useVpLiveness: (
    providerAddress: string | undefined,
    vaultId: string,
    enabled: boolean,
  ) => {
    liveness.calls.push([providerAddress, vaultId, enabled]);
    return { status: liveness.status, retry: liveness.retry };
  },
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Loader: () => <div data-testid="loader" />,
  Text: (props: Record<string, unknown>) => (
    <span>{props.children as ReactNode}</span>
  ),
  Button: (props: Record<string, unknown>) => {
    const { children, disabled, onClick } = props;
    return (
      <button
        disabled={disabled as boolean}
        onClick={onClick as () => void}
        data-testid={props["data-testid"] as string | undefined}
      >
        {children as ReactNode}
      </button>
    );
  },
  Checkbox: (props: Record<string, unknown>) => (
    <input
      type="checkbox"
      data-testid="risk-checkbox"
      checked={props.checked as boolean}
      onChange={props.onChange as () => void}
    />
  ),
  ResponsiveDialog: (props: Record<string, unknown>) =>
    props.open ? <div>{props.children as ReactNode}</div> : null,
  // className is forwarded so the sheet-inset assertions can read it.
  DialogBody: (props: Record<string, unknown>) => (
    <div data-testid="dialog-body" className={props.className as string}>
      {props.children as ReactNode}
    </div>
  ),
  DialogFooter: (props: Record<string, unknown>) => (
    <div data-testid="dialog-footer" className={props.className as string}>
      {props.children as ReactNode}
    </div>
  ),
  WINDOW_BREAKPOINT: 640,
  useIsMobile: () => viewport.isMobile,
}));

// The real icon is an aria-hidden SVG with no handle; expose its variant.
vi.mock("@/components/deposit/ArtifactModalIcon", () => ({
  ArtifactModalIcon: (props: { variant: string }) => (
    <div data-testid="artifact-icon" data-variant={props.variant} />
  ),
}));

vi.mock("@/components/deposit/RecoveryArtifactsCard", () => ({
  RecoveryArtifactsCard: forwardRef<
    { cancel: () => void; download: () => void },
    {
      onDownloaded?: () => void;
      onDelivered?: () => void;
      onStateChange?: (state: {
        loading: boolean;
        receivedBytes: number;
        totalBytes: number;
        status: string;
        error: string | null;
      }) => void;
      onGraphMismatch?: () => void;
    }
  >((props, ref) => {
    useImperativeHandle(ref, () => ({
      cancel: cardCancelSpy,
      download: cardDownloadSpy,
    }));
    return (
      <div data-testid="recovery-card">
        <button
          type="button"
          data-testid="card-download-complete"
          onClick={() => props.onDownloaded?.()}
        >
          download
        </button>
        <button
          type="button"
          data-testid="card-download-idle"
          onClick={() =>
            props.onStateChange?.({
              loading: false,
              receivedBytes: 0,
              totalBytes: 0,
              status: "",
              error: null,
            })
          }
        >
          idle
        </button>
        <button
          type="button"
          data-testid="card-download-delivered"
          onClick={() => props.onDelivered?.()}
        >
          delivered
        </button>
        <button
          type="button"
          data-testid="card-download-start"
          onClick={() =>
            props.onStateChange?.({
              loading: true,
              receivedBytes: 742_000_000,
              totalBytes: 1_000_000_000,
              status: "",
              error: null,
            })
          }
        >
          start
        </button>
        <button
          type="button"
          data-testid="card-download-failed"
          onClick={() =>
            props.onStateChange?.({
              loading: false,
              receivedBytes: 0,
              totalBytes: 0,
              status: "",
              error: "Download failed",
            })
          }
        >
          failed
        </button>
        <button
          type="button"
          data-testid="card-graph-mismatch"
          onClick={() => props.onGraphMismatch?.()}
        >
          mismatch
        </button>
      </div>
    );
  }),
}));

const VAULT_ID = "0xabc123";
const COMMON_PROPS = {
  vaultId: VAULT_ID,
  providerAddress: "0x1111111111111111111111111111111111111111",
  peginTxid: "0xpegin",
  depositorPk: "0xpk",
} as const;

/** A receipt bound to COMMON_PROPS.peginTxid, as a real download writes. */
function seedReceipt(peginTxid: string = COMMON_PROPS.peginTxid) {
  saveArtifactDownloadReceipt(VAULT_ID, {
    version: ARTIFACT_RECEIPT_VERSION,
    peginTxid: normalizePeginTxid(peginTxid),
    filename: "babylon-vault-artifacts-pegin.json",
    byteLength: 1024,
    sha256: "9".repeat(64),
    savedAt: 1_700_000_000_000,
    method: "file-system-access",
  });
}

type ModalProps = Partial<ComponentProps<typeof ActivateConfirmationModal>>;

/** Renders with the common props; `rerenderWith` moves props or the probe's verdict mid-test. */
function renderModal(overrides: ModalProps = {}) {
  const props = {
    open: true,
    ...COMMON_PROPS,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  const view = render(<ActivateConfirmationModal {...props} />);
  return {
    ...view,
    props,
    rerenderWith: (next: ModalProps = {}) =>
      view.rerender(<ActivateConfirmationModal {...props} {...next} />),
  };
}

describe("ActivateConfirmationModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cardCancelSpy.mockClear();
    cardDownloadSpy.mockClear();
    viewport.isMobile = false;
    liveness.status = "reachable";
    liveness.retry.mockReset();
    liveness.calls = [];
  });

  it("cancels the download in place without closing the modal while a download is in flight", () => {
    const onClose = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-start"));

    fireEvent.click(screen.getByText("Cancel download"));
    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("replaces the activation body with the download progress and drops the Activate button while a download is in flight", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-start"));

    expect(screen.getByText("Downloading BTCVault artifacts")).toBeTruthy();
    expect(screen.getByText("74%")).toBeTruthy();
    expect(screen.getByText("1.00 GB").parentElement?.textContent).toBe(
      "742 MB / 1.00 GB",
    );
    expect(screen.getByText("Cancel download")).toBeTruthy();
    expect(screen.queryByText("Download BTCVault artifacts")).toBeNull();
    expect(screen.queryByText("Activate BTCVault")).toBeNull();
    expect(screen.queryByTestId("risk-checkbox")).toBeNull();
  });

  it("returns to the activation body once the download finishes", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-start"));
    fireEvent.click(screen.getByTestId("card-download-complete"));
    fireEvent.click(screen.getByTestId("card-download-idle"));

    expect(screen.queryByText("Downloading BTCVault artifacts")).toBeNull();
    expect(screen.getByText("Artifacts downloaded")).toBeTruthy();
    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();
  });

  it("withdraws the risk opt-out and keeps Activate disabled after a graph mismatch", () => {
    // A mismatch is evidence the provider served a graph other than the one
    // signed, not missing evidence: the checkbox must not unlock activation.
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Continue without")).toBeTruthy();

    fireEvent.click(screen.getByTestId("card-graph-mismatch"));
    expect(screen.queryByText("Activate BTCVault")).toBeNull();
    expect(screen.queryByText("Continue without")).toBeNull();
    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();
  });

  it("keeps the risk opt-out withdrawn when the modal reopens after a stored mismatch", () => {
    // ActivationGate unmounts the modal on close, so a reopen is a fresh
    // mount: the mismatch must come back from storage, not component state.
    saveGraphMismatch(VAULT_ID, COMMON_PROPS.peginTxid);
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Activate BTCVault")).toBeNull();
    expect(screen.queryByText("Continue without")).toBeNull();
  });

  it("keeps Activate disabled after a mismatch even with an earlier download receipt", () => {
    seedReceipt();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("card-graph-mismatch"));
    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
  });

  it("disables the Activate button until the risk checkbox is ticked when not downloaded", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Continue without"));

    const activateBtn = screen.getByText("Activate BTCVault");
    expect(activateBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    expect(activateBtn).not.toBeDisabled();
  });

  it("calls onConfirm when Activate BTCVault is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText("Continue without"));
    fireEvent.click(screen.getByTestId("risk-checkbox"));
    fireEvent.click(screen.getByText("Activate BTCVault"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", () => {
    seedReceipt();
    const onClose = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-flight download and closes when the header close control is clicked", () => {
    const onClose = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-start"));
    fireEvent.click(screen.getByTestId("activate-modal-close"));

    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves the close control to the sheet below the breakpoint", () => {
    viewport.isMobile = true;
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("activate-modal-close")).toBeNull();
  });

  it("restores the sheet inset below the breakpoint", () => {
    viewport.isMobile = true;
    const { unmount } = render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("dialog-body")).toHaveClass("px-6");
    unmount();

    viewport.isMobile = false;
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("dialog-body")).not.toHaveClass("px-6");
  });

  it("names the close control for assistive technology", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBe(
      screen.getByTestId("activate-modal-close"),
    );
  });

  it("enables Activate BTCVault, hides the checkbox, and shows the downloaded heading when artifacts were already downloaded", () => {
    seedReceipt();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Artifacts downloaded")).toBeInTheDocument();
    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();
    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();
  });

  it("still requires the acknowledgement when the receipt is for a different pegin", () => {
    // A stale receipt, or one belonging to another vault's deposit, is not
    // evidence that this deposit's recovery bundle is on disk.
    seedReceipt("0xsomeotherpegin");
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Continue without"));

    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();
  });

  it("enables Activate BTCVault and removes the checkbox once the card reports a download", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText("Activate BTCVault")).toBeNull();
    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("card-download-complete"));

    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();
    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();
  });

  it("keeps the checkbox and Activate disabled when the card reports only a delivered download", () => {
    // The anchor fallback (Firefox/Safari) cannot prove the file reached
    // disk, so it must not stand in for the acknowledgement: a blocked or
    // dismissed save would otherwise unlock activation with no evidence and
    // no attestation, which is what the fallback hint promises it will not do.
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-delivered"));

    expect(screen.queryByText("Activate BTCVault")).toBeNull();

    fireEvent.click(screen.getByText("Continue without"));

    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();
  });

  it("enables Activate BTCVault after an unverified download only once the risk is acknowledged", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-delivered"));
    fireEvent.click(screen.getByText("Continue without"));
    fireEvent.click(screen.getByTestId("risk-checkbox"));

    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();
  });

  it("returns to the download step with the acknowledgement cleared when Cancel is clicked on the confirm-skip step", () => {
    const onClose = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    const card = screen.getByTestId("recovery-card");
    fireEvent.click(screen.getByText("Continue without"));
    expect(card).not.toBeVisible();
    fireEvent.click(screen.getByTestId("risk-checkbox"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByTestId("recovery-card")).toBe(card);
    expect(card).toBeVisible();
    fireEvent.click(screen.getByText("Continue without"));

    expect(screen.getByTestId("risk-checkbox")).not.toBeChecked();
    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("starts the card download when Download Artifacts is clicked", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Download Artifacts"));

    expect(cardDownloadSpy).toHaveBeenCalledTimes(1);
  });

  it("holds the skip but not the download while the provider is being probed", () => {
    liveness.status = "probing";
    renderModal();

    expect(screen.getByTestId("download-artifacts-button")).toBeEnabled();
    expect(screen.queryByText("Continue without")).toBeNull();
    expect(screen.queryByText("Activate BTCVault")).toBeNull();
    expect(
      screen.getByText("Checking that your vault provider is responding..."),
    ).toBeTruthy();
  });

  it("cancels an in-flight download when the verdict turns unconfirmed", () => {
    liveness.status = "probing";
    const { rerenderWith } = renderModal();
    fireEvent.click(screen.getByTestId("card-download-start"));
    expect(screen.getByText("Cancel download")).toBeTruthy();

    liveness.status = "vp-unconfirmed";
    rerenderWith();

    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    // The real hook resets its state on cancel; the mock reports that reset here.
    fireEvent.click(screen.getByTestId("card-download-idle"));
    expect(
      screen.getByText("Could not confirm your vault provider"),
    ).toBeTruthy();
    expect(screen.queryByText("Cancel download")).toBeNull();
  });

  it("offers Download and Continue without as today once the provider answers", () => {
    renderModal();

    expect(screen.getByTestId("download-artifacts-button")).toBeEnabled();
    expect(screen.getByText("Continue without")).toBeTruthy();
    expect(
      screen.queryByText("Checking that your vault provider is responding..."),
    ).toBeNull();
  });

  it("re-probes once per failed download", () => {
    renderModal();

    fireEvent.click(screen.getByTestId("card-download-failed"));
    expect(liveness.retry).toHaveBeenCalledTimes(1);

    // The real hook clears its error when the next download starts.
    fireEvent.click(screen.getByTestId("card-download-idle"));
    fireEvent.click(screen.getByTestId("card-download-failed"));
    expect(liveness.retry).toHaveBeenCalledTimes(2);
  });

  it("collapses the confirm-skip step when the probe stops confirming", () => {
    const { rerenderWith } = renderModal();
    fireEvent.click(screen.getByText("Continue without"));
    fireEvent.click(screen.getByTestId("risk-checkbox"));
    expect(screen.getByTestId("activate-vault-button")).toBeEnabled();

    liveness.status = "vp-unconfirmed";
    rerenderWith();

    expect(screen.queryByTestId("activate-vault-button")).toBeNull();
    expect(screen.queryByTestId("risk-checkbox")).toBeNull();
    expect(
      screen.getByText("Could not confirm your vault provider"),
    ).toBeTruthy();

    liveness.status = "reachable";
    rerenderWith();

    // Back on the download step with the acknowledgement cleared: the skip
    // must be chosen again.
    expect(screen.getByText("Download BTCVault artifacts")).toBeTruthy();
    fireEvent.click(screen.getByText("Continue without"));
    expect(screen.getByTestId("activate-vault-button")).toBeDisabled();
  });

  it("drops the download presentation when the deposit's details go missing mid-download", () => {
    const { rerenderWith } = renderModal();
    fireEvent.click(screen.getByTestId("card-download-start"));
    expect(screen.getByText("Cancel download")).toBeTruthy();

    rerenderWith({ depositorPk: undefined });

    expect(screen.getByText("Deposit details incomplete")).toBeTruthy();
    expect(screen.queryByText("Cancel download")).toBeNull();
    expect(screen.queryByText("Downloading BTCVault artifacts")).toBeNull();
    fireEvent.click(screen.getByText("Cancel"));
  });

  it("collapses the confirm-skip step when the deposit's details go missing", () => {
    const { rerenderWith } = renderModal();
    fireEvent.click(screen.getByText("Continue without"));
    fireEvent.click(screen.getByTestId("risk-checkbox"));

    rerenderWith({ depositorPk: undefined });

    expect(screen.getByText("Deposit details incomplete")).toBeTruthy();
    expect(screen.queryByTestId("activate-vault-button")).toBeNull();
    expect(screen.queryByTestId("risk-checkbox")).toBeNull();
  });

  it("blocks everything but Cancel and Check again when the provider is unconfirmed", () => {
    liveness.status = "vp-unconfirmed";
    const { props } = renderModal();

    expect(
      screen.getByText("Could not confirm your vault provider"),
    ).toBeTruthy();
    expect(screen.getByText(/Do not activate this BTCVault/)).toBeTruthy();
    expect(screen.queryByTestId("download-artifacts-button")).toBeNull();
    expect(screen.queryByText("Continue without")).toBeNull();
    expect(screen.queryByTestId("activate-vault-button")).toBeNull();
    expect(screen.queryByTestId("risk-checkbox")).toBeNull();

    fireEvent.click(screen.getByTestId("retry-vp-probe-button"));
    expect(liveness.retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Cancel"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the service-unreachable title and retries when the proxy is down", () => {
    liveness.status = "proxy-unreachable";
    renderModal();

    expect(
      screen.getByText("Cannot reach the vault provider service"),
    ).toBeTruthy();
    expect(screen.queryByTestId("activate-vault-button")).toBeNull();
    fireEvent.click(screen.getByTestId("retry-vp-probe-button"));
    expect(liveness.retry).toHaveBeenCalledTimes(1);
  });

  it("keeps Activate enabled with a warning and a Check again when artifacts exist and the provider is unconfirmed", () => {
    seedReceipt();
    liveness.status = "vp-unconfirmed";
    const { props } = renderModal();

    expect(screen.getByText("Artifacts downloaded")).toBeTruthy();
    expect(
      screen.getByText(
        /We could not confirm that your vault provider is responding\. Your artifacts were saved earlier/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("retry-vp-probe-button"));
    expect(liveness.retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("activate-vault-button"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("holds Activate while the probe is pending even when artifacts exist", () => {
    seedReceipt();
    liveness.status = "probing";
    renderModal();

    expect(screen.getByTestId("activate-vault-button")).toBeDisabled();
    expect(
      screen.getByText("Checking that your vault provider is responding..."),
    ).toBeTruthy();
  });

  it("blocks with Cancel only when the deposit's details are incomplete", () => {
    liveness.status = "idle";
    const { props } = renderModal({ providerAddress: undefined });

    expect(screen.getByText("Deposit details incomplete")).toBeTruthy();
    // Nothing to ask the provider about: the hook is told not to probe.
    expect(liveness.calls.at(-1)?.[2]).toBe(false);
    expect(screen.queryByTestId("download-artifacts-button")).toBeNull();
    expect(screen.queryByText("Continue without")).toBeNull();
    expect(screen.queryByTestId("activate-vault-button")).toBeNull();
    expect(screen.queryByTestId("retry-vp-probe-button")).toBeNull();
    fireEvent.click(screen.getByText("Cancel"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks an incomplete deposit even with a stored receipt", () => {
    seedReceipt();
    renderModal({ depositorPk: undefined });

    expect(screen.getByText("Deposit details incomplete")).toBeTruthy();
    expect(screen.queryByTestId("activate-vault-button")).toBeNull();
    expect(screen.queryByText("Artifacts downloaded")).toBeNull();
    // A green "downloaded" icon above a blocked title would contradict it.
    expect(screen.queryByTestId("artifact-icon")).toBeNull();
  });

  it("shows the downloaded icon with the downloaded title", () => {
    seedReceipt();
    renderModal();

    expect(screen.getByText("Artifacts downloaded")).toBeTruthy();
    expect(screen.getByTestId("artifact-icon")).toHaveAttribute(
      "data-variant",
      "downloaded",
    );
  });

  it("keeps today's downloaded modal, card included, when the proxy is down", () => {
    seedReceipt();
    liveness.status = "proxy-unreachable";
    const { props } = renderModal();

    expect(screen.getByText("Artifacts downloaded")).toBeTruthy();
    expect(screen.getByTestId("recovery-card")).toBeVisible();
    expect(screen.queryByTestId("retry-vp-probe-button")).toBeNull();
    fireEvent.click(screen.getByTestId("activate-vault-button"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("hides the downloaded card under the unconfirmed warning, which already says the artifacts are saved", () => {
    seedReceipt();
    liveness.status = "vp-unconfirmed";
    renderModal();

    // The desktop dialog has no height cap, so the tallest state stays short.
    expect(screen.getByTestId("recovery-card")).not.toBeVisible();
    expect(screen.getByTestId("retry-vp-probe-button")).toBeTruthy();
  });

  it("takes a simulated provider verdict for god-mode demo vaults", () => {
    liveness.status = "probing";
    renderModal({ simulateProviderLiveness: true });

    expect(screen.getByText("Continue without")).toBeTruthy();
    expect(
      screen.queryByText("Checking that your vault provider is responding..."),
    ).toBeNull();
    // The demo's synthetic provider has no network answer, so no probe runs.
    expect(liveness.calls.at(-1)?.[2]).toBe(false);
  });

  it("hands the hook this deposit's provider and vault with the probe enabled", () => {
    renderModal();

    expect(liveness.calls.at(-1)).toEqual([
      "0x1111111111111111111111111111111111111111",
      VAULT_ID,
      true,
    ]);
  });

  it("blocks a malformed provider address as incomplete details instead of probing it", () => {
    const { props } = renderModal({ providerAddress: "0xprovider" });

    expect(liveness.calls.at(-1)?.[2]).toBe(false);
    expect(screen.getByText("Deposit details incomplete")).toBeTruthy();
    expect(
      screen.queryByText("Cannot reach the vault provider service"),
    ).toBeNull();
    fireEvent.click(screen.getByText("Cancel"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the neutral downloaded body, the card and Cancel when a mismatch already withholds Activate under an unconfirmed provider", () => {
    seedReceipt();
    liveness.status = "vp-unconfirmed";
    renderModal();
    fireEvent.click(screen.getByTestId("card-graph-mismatch"));

    expect(screen.getByTestId("activate-vault-button")).toBeDisabled();
    expect(
      screen.getByText(/Your files are stored locally and never uploaded/),
    ).toBeTruthy();
    expect(screen.queryByText(/you can still activate/)).toBeNull();
    expect(screen.getByTestId("recovery-card")).toBeVisible();
    // Re-probing could not enable Activate here, so the footer keeps Cancel.
    expect(screen.queryByTestId("retry-vp-probe-button")).toBeNull();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });
});
