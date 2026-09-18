import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoveryArtifactsCard } from "../RecoveryArtifactsCard";

const IDLE_HOOK_STATE = {
  loading: false,
  progress: "",
  error: null as string | null,
  downloaded: false,
  delivered: false,
  receivedBytes: 0,
  totalBytes: 0,
  download: vi.fn(),
  cancel: vi.fn(),
};

const hookState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/deposit/useArtifactDownload", () => ({
  useArtifactDownload: () => hookState.current,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: () => null,
}));

const COMMON_PROPS = {
  providerAddress: "0xprovider",
  peginTxid: "0xpegin",
  depositorPk: "0xpk",
  vaultId: "0xabc123",
} as const;

describe("RecoveryArtifactsCard — streaming download", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE };
  });

  it("renders nothing while a download streams, leaving the presentation to the parent", () => {
    hookState.current = {
      ...IDLE_HOOK_STATE,
      loading: true,
      receivedBytes: 742_000_000,
      totalBytes: 1_000_000_000,
    };
    const { container } = render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("reports the streaming bytes and total to its parent", () => {
    hookState.current = {
      ...IDLE_HOOK_STATE,
      loading: true,
      receivedBytes: 742_000_000,
      totalBytes: 1_000_000_000,
      progress: "Fetching artifacts from vault provider...",
    };
    const onStateChange = vi.fn();
    render(
      <RecoveryArtifactsCard {...COMMON_PROPS} onStateChange={onStateChange} />,
    );

    expect(onStateChange).toHaveBeenCalledWith({
      loading: true,
      receivedBytes: 742_000_000,
      totalBytes: 1_000_000_000,
      status: "Fetching artifacts from vault provider...",
    });
  });
});

describe("RecoveryArtifactsCard — idle card", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE };
  });

  it("names the artifacts, what they are, and how large they are before any download", () => {
    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(screen.getByText("Recovery artifacts")).toBeTruthy();
    expect(screen.getByText("Encrypted backup files")).toBeTruthy();
    expect(screen.getByText("Up to ~1 GB")).toBeTruthy();
  });

  it("starts the download for this deposit when the download button is clicked", () => {
    const download = vi.fn();
    hookState.current = { ...IDLE_HOOK_STATE, download };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);
    fireEvent.click(screen.getByText("Download Artifacts"));

    expect(download).toHaveBeenCalledWith("0xprovider", "0xpegin", "0xpk");
  });
});

describe("RecoveryArtifactsCard — unverifiable save", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE };
  });

  it("does not report a download upward when the save could not be verified", () => {
    // onDownloaded is what removes the activation modal's risk acknowledgement
    // and enables Activate. The anchor fallback proves only that a link was
    // clicked, so firing it there would unlock activation for a save the
    // browser may have blocked or the user may have dismissed.
    const onDownloaded = vi.fn();
    const onDelivered = vi.fn();
    hookState.current = { ...IDLE_HOOK_STATE, delivered: true };

    render(
      <RecoveryArtifactsCard
        {...COMMON_PROPS}
        onDownloaded={onDownloaded}
        onDelivered={onDelivered}
      />,
    );

    expect(onDownloaded).not.toHaveBeenCalled();
    expect(onDelivered).toHaveBeenCalledTimes(1);
  });

  it("keeps the download available and warns that the save is unconfirmed", () => {
    hookState.current = { ...IDLE_HOOK_STATE, delivered: true };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(screen.getByTestId("artifact-unverified-notice")).toBeTruthy();
    expect(screen.getByText("Download Again")).toBeTruthy();
  });

  it("reports a download upward once there is real evidence", () => {
    const onDownloaded = vi.fn();
    hookState.current = { ...IDLE_HOOK_STATE, downloaded: true };

    render(
      <RecoveryArtifactsCard {...COMMON_PROPS} onDownloaded={onDownloaded} />,
    );

    expect(onDownloaded).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("artifact-unverified-notice")).toBeNull();
  });
});
