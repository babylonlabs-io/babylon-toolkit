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
  Warning: (props: Record<string, unknown>) => (
    <div data-testid="warning">{props.children as ReactNode}</div>
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

const VAULT_ID = "0xabc123";

describe("ActivateConfirmationModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the Download CTA and a disabled Activate-without-downloading button when not yet downloaded", () => {
    render(
      <ActivateConfirmationModal
        open
        vaultId={VAULT_ID}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(screen.getByText("Download Artifacts")).toBeInTheDocument();
    const activateBtn = screen.getByText("Activate without downloading");
    expect(activateBtn).toBeDisabled();
  });

  it("enables the activate-without-downloading button after the checkbox is ticked", () => {
    const onConfirm = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        vaultId={VAULT_ID}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("risk-checkbox"));
    const activateBtn = screen.getByText("Activate without downloading");
    expect(activateBtn).not.toBeDisabled();
    fireEvent.click(activateBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("invokes onDownloadArtifacts when the user clicks Download", () => {
    const onDownloadArtifacts = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        vaultId={VAULT_ID}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDownloadArtifacts={onDownloadArtifacts}
      />,
    );
    fireEvent.click(screen.getByText("Download Artifacts"));
    expect(onDownloadArtifacts).toHaveBeenCalledTimes(1);
  });

  it("shows a single Activate primary CTA when artifacts are already downloaded", () => {
    markArtifactsDownloaded(VAULT_ID);
    const onConfirm = vi.fn();
    render(
      <ActivateConfirmationModal
        open
        vaultId={VAULT_ID}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(screen.getByText("Activate")).toBeInTheDocument();
    expect(
      screen.queryByText("Activate without downloading"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Download Artifacts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Activate"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("re-reads the downloaded flag when downloadCompletedAt changes", () => {
    const { rerender } = render(
      <ActivateConfirmationModal
        open
        vaultId={VAULT_ID}
        downloadCompletedAt={0}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(screen.getByText("Download Artifacts")).toBeInTheDocument();

    markArtifactsDownloaded(VAULT_ID);
    rerender(
      <ActivateConfirmationModal
        open
        vaultId={VAULT_ID}
        downloadCompletedAt={1}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDownloadArtifacts={vi.fn()}
      />,
    );

    expect(screen.getByText("Activate")).toBeInTheDocument();
    expect(screen.queryByText("Download Artifacts")).not.toBeInTheDocument();
  });
});
