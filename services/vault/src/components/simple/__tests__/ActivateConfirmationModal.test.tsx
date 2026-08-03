import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIFACT_RECEIPT_VERSION,
  normalizePeginTxid,
  saveArtifactDownloadReceipt,
} from "@/utils/artifactDownloadStorage";

import { ActivateConfirmationModal } from "../ActivateConfirmationModal";

const cardCancelSpy = vi.hoisted(() => vi.fn());

vi.mock("@babylonlabs-io/core-ui", () => ({
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
  DialogBody: (props: Record<string, unknown>) => (
    <div>{props.children as ReactNode}</div>
  ),
  DialogFooter: (props: Record<string, unknown>) => (
    <div>{props.children as ReactNode}</div>
  ),
}));

vi.mock("@/components/deposit/RecoveryArtifactsCard", () => ({
  RecoveryArtifactsCard: forwardRef<
    { cancel: () => void },
    {
      onDownloaded?: () => void;
      onDelivered?: () => void;
      onLoadingChange?: (loading: boolean) => void;
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
          data-testid="card-download-delivered"
          onClick={() => props.onDelivered?.()}
        >
          delivered
        </button>
        <button
          type="button"
          data-testid="card-download-start"
          onClick={() => props.onLoadingChange?.(true)}
        >
          start
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

  it("disables Activate vault while a download is in flight even when the risk is acknowledged", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    expect(screen.getByText("Activate vault")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("card-download-start"));
    expect(screen.getByText("Activate vault")).toBeDisabled();
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

    const activateBtn = screen.getByText("Activate vault");
    expect(activateBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    expect(activateBtn).not.toBeDisabled();
  });

  it("calls onConfirm when Activate vault is clicked", () => {
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
    fireEvent.click(screen.getByText("Activate vault"));
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

  it("enables Activate vault, hides the checkbox, and shows the downloaded heading when artifacts were already downloaded", () => {
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
    expect(screen.getByText("Activate vault")).not.toBeDisabled();
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

    expect(screen.getByText("Activate vault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();
  });

  it("enables Activate vault and removes the checkbox once the card reports a download", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Activate vault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("card-download-complete"));

    expect(screen.getByText("Activate vault")).not.toBeDisabled();
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

    expect(screen.getByText("Activate vault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();
  });

  it("enables Activate vault after an unverified download only once the risk is acknowledged", () => {
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

    expect(screen.getByText("Activate vault")).not.toBeDisabled();
  });
});
