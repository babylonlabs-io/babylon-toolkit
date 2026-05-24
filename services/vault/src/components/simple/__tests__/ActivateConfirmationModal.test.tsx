import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

import { ActivateConfirmationModal } from "../ActivateConfirmationModal";

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
  DialogHeader: (props: Record<string, unknown>) => (
    <div>{props.title as string}</div>
  ),
  DialogBody: (props: Record<string, unknown>) => (
    <div>{props.children as ReactNode}</div>
  ),
  DialogFooter: (props: Record<string, unknown>) => (
    <div>{props.children as ReactNode}</div>
  ),
}));

vi.mock("@/components/deposit/RecoveryArtifactsCard", () => ({
  RecoveryArtifactsCard: (props: { onDownloaded?: () => void }) => (
    <div data-testid="recovery-card">
      <button
        type="button"
        data-testid="card-download-complete"
        onClick={() => props.onDownloaded?.()}
      >
        download
      </button>
    </div>
  ),
}));

const VAULT_ID = "0xabc123";
const COMMON_PROPS = {
  vaultId: VAULT_ID,
  providerAddress: "0xprovider",
  peginTxid: "0xpegin",
  depositorPk: "0xpk",
} as const;

describe("ActivateConfirmationModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
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

    const activateBtn = screen.getByText("Activate Vault");
    expect(activateBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    expect(activateBtn).not.toBeDisabled();
  });

  it("calls onConfirm when Activate Vault is clicked", () => {
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
    fireEvent.click(screen.getByText("Activate Vault"));
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

  it("enables Activate Vault directly and hides the checkbox when artifacts were already downloaded", () => {
    markArtifactsDownloaded(VAULT_ID);
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Activate Vault")).not.toBeDisabled();
    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();
  });

  it("enables Activate Vault and removes the checkbox once the card reports a download", () => {
    render(
      <ActivateConfirmationModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Activate Vault")).toBeDisabled();
    expect(screen.getByTestId("risk-checkbox")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("card-download-complete"));

    expect(screen.getByText("Activate Vault")).not.toBeDisabled();
    expect(screen.queryByTestId("risk-checkbox")).not.toBeInTheDocument();
  });
});
