import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

import { ArtifactDownloadModal } from "..";

const cardCancelSpy = vi.hoisted(() => vi.fn());

vi.mock("@babylonlabs-io/core-ui", () => ({
  Button: (props: Record<string, unknown>) => (
    <button onClick={props.onClick as () => void}>
      {props.children as ReactNode}
    </button>
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
  RecoveryArtifactsCard: forwardRef<
    { cancel: () => void },
    { onDownloaded?: () => void; onLoadingChange?: (loading: boolean) => void }
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

describe("ArtifactDownloadModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cardCancelSpy.mockClear();
  });

  it("shows the download card and closes via Cancel, cancelling any in-flight download, before the artifacts are downloaded", () => {
    const onClose = vi.fn();
    render(
      <ArtifactDownloadModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("recovery-card")).toBeTruthy();
    expect(screen.getByText("Activate your BTC Vault")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the downloading state with an in-place Cancel download action while the download is in flight", () => {
    const onClose = vi.fn();
    render(
      <ArtifactDownloadModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-start"));
    expect(screen.getByText("Downloading vault artifacts")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel download"));
    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("switches to the artifacts-downloaded confirmation once the card reports completion", () => {
    render(
      <ArtifactDownloadModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("card-download-complete"));

    expect(screen.getByText("Artifacts downloaded")).toBeTruthy();
    expect(
      screen.getByText("Your files are stored locally and never uploaded."),
    ).toBeTruthy();
    expect(screen.queryByTestId("recovery-card")).toBeNull();
  });

  it("shows a single Continue firing onComplete in the downloaded state when no activate action is provided", () => {
    markArtifactsDownloaded(VAULT_ID);
    const onComplete = vi.fn();
    render(
      <ArtifactDownloadModal
        open
        {...COMMON_PROPS}
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );

    expect(screen.queryByText("Activate vault")).toBeNull();
    fireEvent.click(screen.getByText("Continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows Cancel and Activate vault in the downloaded state when an activate action is provided", () => {
    markArtifactsDownloaded(VAULT_ID);
    const onClose = vi.fn();
    const onActivate = vi.fn();
    render(
      <ArtifactDownloadModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onActivate={onActivate}
      />,
    );

    expect(screen.queryByText("Continue")).toBeNull();

    fireEvent.click(screen.getByText("Activate vault"));
    expect(onActivate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
