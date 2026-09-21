import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIFACT_RECEIPT_VERSION,
  normalizePeginTxid,
  saveArtifactDownloadReceipt,
  saveGraphMismatch,
} from "@/utils/artifactDownloadStorage";

import { ActivateConfirmationModal } from "../ActivateConfirmationModal";

const cardCancelSpy = vi.hoisted(() => vi.fn());
const viewport = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Loader: () => <div data-testid="loader" />,
  Text: (props: Record<string, unknown>) => (
    <span>{props.children as ReactNode}</span>
  ),
  Button: (props: Record<string, unknown>) => {
    const { children, disabled, onClick } = props;
    return (
      <button disabled={disabled as boolean} onClick={onClick as () => void}>
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

vi.mock("@/components/deposit/RecoveryArtifactsCard", () => ({
  RecoveryArtifactsCard: forwardRef<
    { cancel: () => void },
    {
      onDownloaded?: () => void;
      onDelivered?: () => void;
      onStateChange?: (state: {
        loading: boolean;
        receivedBytes: number;
        totalBytes: number;
        status: string;
      }) => void;
      onGraphMismatch?: () => void;
    }
  >((props, ref) => {
    useImperativeHandle(ref, () => ({ cancel: cardCancelSpy }));
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
            })
          }
        >
          start
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
  providerAddress: "0xprovider",
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

describe("ActivateConfirmationModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cardCancelSpy.mockClear();
    viewport.isMobile = false;
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
    expect(screen.queryByText("Activate your BTCVault")).toBeNull();
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

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("card-graph-mismatch"));
    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
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
    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
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

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    fireEvent.click(screen.getByText("Activate BTCVault"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", () => {
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

    expect(screen.getByText("Activate BTCVault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();

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
    fireEvent.click(screen.getByTestId("risk-checkbox"));

    expect(screen.getByText("Activate BTCVault")).not.toBeDisabled();
  });
});
