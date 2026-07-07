import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    <button data-testid="dialog-close" onClick={props.onClose as () => void}>
      close
    </button>
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
      <button
        type="button"
        data-testid="card-download-start"
        onClick={() => props.onLoadingChange?.(true)}
      >
        start
      </button>
    );
  }),
}));

const COMMON_PROPS = {
  providerAddress: "0xprovider",
  peginTxid: "0xpegin",
  depositorPk: "0xpk",
  vaultId: "0xabc123",
} as const;

describe("ArtifactDownloadModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cardCancelSpy.mockClear();
  });

  it("cancels the download in place without closing the modal while a download is in flight", () => {
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

    fireEvent.click(screen.getByText("Cancel download"));
    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels any in-flight download and closes when the X button is clicked", () => {
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

    fireEvent.click(screen.getByTestId("dialog-close"));
    expect(cardCancelSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via Cancel when no download is in flight", () => {
    const onClose = vi.fn();
    render(
      <ArtifactDownloadModal
        open
        {...COMMON_PROPS}
        onClose={onClose}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
