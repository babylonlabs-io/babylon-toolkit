import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { isFileSystemAccessSupported } from "@/services/artifacts";
import {
  saveArtifactDownloadReceipt,
  saveGraphMismatch,
} from "@/utils/artifactDownloadStorage";

import {
  RecoveryArtifactsCard,
  type RecoveryArtifactsCardHandle,
} from "../RecoveryArtifactsCard";

const IDLE_HOOK_STATE = {
  loading: false,
  progress: "",
  error: null as string | null,
  downloaded: false,
  delivered: false,
  graphUnchecked: false,
  graphMismatch: false,
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

// Real (jsdom has no showSaveFilePicker) unless a test overrides it.
vi.mock("@/services/artifacts", async () => {
  const actual = await vi.importActual<typeof import("@/services/artifacts")>(
    "@/services/artifacts",
  );
  return {
    ...actual,
    isFileSystemAccessSupported: vi.fn(actual.isFileSystemAccessSupported),
  };
});

vi.mock("@babylonlabs-io/wallet-connector/btc-eth", () => ({
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
      error: null,
    });
  });

  it("reports the hook's error through onStateChange", () => {
    hookState.current = {
      ...hookState.current,
      loading: false,
      error: "Download failed",
    };
    const onStateChange = vi.fn();
    render(
      <RecoveryArtifactsCard {...COMMON_PROPS} onStateChange={onStateChange} />,
    );

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ loading: false, error: "Download failed" }),
    );
  });

  it.each(["activation", "vault"] as const)(
    "shows the quota error and permits another download in %s",
    (context) => {
      const download = vi.fn();
      hookState.current = {
        ...IDLE_HOOK_STATE,
        download,
        error: COPY.deposit.recoveryArtifacts.downloadLimitReached,
      };
      const onStateChange = vi.fn();
      const ref = createRef<RecoveryArtifactsCardHandle>();
      render(
        <RecoveryArtifactsCard
          {...COMMON_PROPS}
          context={context}
          ref={ref}
          onStateChange={onStateChange}
        />,
      );

      expect(
        screen.getByText(
          "Too many artifact download requests. Wait and try again later.",
        ),
      ).toBeVisible();
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          loading: false,
          error: COPY.deposit.recoveryArtifacts.downloadLimitReached,
        }),
      );
      act(() => ref.current?.download());
      expect(download).toHaveBeenCalledTimes(1);
      expect(download).toHaveBeenCalledWith("0xprovider", "0xpegin", "0xpk");
    },
  );
});

describe("RecoveryArtifactsCard — idle card", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE };
  });

  it("names the artifacts, what they are, and how large they are before any download", () => {
    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(screen.getByText("Recovery artifacts")).toBeTruthy();
    expect(screen.getByText("Recovery file for this BTCVault")).toBeTruthy();
    expect(screen.getByText("Up to ~1 GB")).toBeTruthy();
  });

  it("starts the download for this deposit when the parent calls download", () => {
    const download = vi.fn();
    hookState.current = { ...IDLE_HOOK_STATE, download };
    const ref = createRef<RecoveryArtifactsCardHandle>();

    render(<RecoveryArtifactsCard {...COMMON_PROPS} ref={ref} />);
    act(() => ref.current?.download());

    expect(download).toHaveBeenCalledWith("0xprovider", "0xpegin", "0xpk");
  });
});

describe("RecoveryArtifactsCard — unverifiable save", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE };
    vi.mocked(isFileSystemAccessSupported).mockReset();
  });

  it("does not report a download upward when the save could not be verified", () => {
    // onDownloaded is what removes the activation modal's risk acknowledgement
    // and enables Activate. The anchor fallback proves only that a link was
    // clicked, so firing it there would unlock activation for a save the
    // browser may have blocked or the user may have dismissed.
    const onDownloaded = vi.fn();
    hookState.current = { ...IDLE_HOOK_STATE, delivered: true };

    render(
      <RecoveryArtifactsCard {...COMMON_PROPS} onDownloaded={onDownloaded} />,
    );

    expect(onDownloaded).not.toHaveBeenCalled();
  });

  it("reports a graph mismatch upward once, so the gate can withdraw the opt-out", () => {
    const onGraphMismatch = vi.fn();
    const onDownloaded = vi.fn();
    hookState.current = { ...IDLE_HOOK_STATE, graphMismatch: true };

    const { rerender } = render(
      <RecoveryArtifactsCard
        {...COMMON_PROPS}
        onGraphMismatch={onGraphMismatch}
        onDownloaded={onDownloaded}
      />,
    );
    rerender(
      <RecoveryArtifactsCard
        {...COMMON_PROPS}
        onGraphMismatch={onGraphMismatch}
        onDownloaded={onDownloaded}
      />,
    );

    expect(onGraphMismatch).toHaveBeenCalledTimes(1);
    expect(onDownloaded).not.toHaveBeenCalled();
  });

  it("shows a mismatch stored by an earlier download, so a reopened modal explains the block", () => {
    saveGraphMismatch(COMMON_PROPS.vaultId, COMMON_PROPS.peginTxid);

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.signedGraphMismatch),
    ).toBeTruthy();
  });

  it("warns that the save is unconfirmed", () => {
    hookState.current = { ...IDLE_HOOK_STATE, delivered: true };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(screen.getByTestId("artifact-unverified-notice")).toBeTruthy();
  });

  it("tells an unchecked download apart and keeps it from unlocking activation", () => {
    const onDownloaded = vi.fn();
    hookState.current = {
      ...IDLE_HOOK_STATE,
      delivered: true,
      graphUnchecked: true,
    };

    render(
      <RecoveryArtifactsCard {...COMMON_PROPS} onDownloaded={onDownloaded} />,
    );

    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.uncheckedGraphTitle),
    ).toBeTruthy();
    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.uncheckedGraphNotice),
    ).toBeTruthy();
    expect(onDownloaded).not.toHaveBeenCalled();
  });

  it("uses the vault wording for an unchecked download on the vaults page", () => {
    hookState.current = {
      ...IDLE_HOOK_STATE,
      delivered: true,
      graphUnchecked: true,
    };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} context="vault" />);

    expect(
      screen.getByText(COPY.deposit.artifactDownload.uncheckedGraphNotice),
    ).toBeTruthy();
  });

  it("shows the unchecked notice over a receipt saved for this pegin, beside the downloaded size", () => {
    saveArtifactDownloadReceipt(COMMON_PROPS.vaultId, {
      version: 1,
      peginTxid: "pegin",
      filename: "babylon-vault-pegin.tar",
      byteLength: 1,
      sha256: "cc".repeat(32),
      savedAt: 1,
      method: "file-system-access",
    });
    hookState.current = {
      ...IDLE_HOOK_STATE,
      delivered: true,
      graphUnchecked: true,
    };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.uncheckedGraphTitle),
    ).toBeTruthy();
    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.uncheckedGraphNotice),
    ).toBeTruthy();
    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.cardSizeDownloaded),
    ).toBeTruthy();
  });

  it("shows no unconfirmed-save notice for a plain delivered save over a receipt for this pegin", () => {
    saveArtifactDownloadReceipt(COMMON_PROPS.vaultId, {
      version: 1,
      peginTxid: "pegin",
      filename: "babylon-vault-pegin.tar",
      byteLength: 1,
      sha256: "cc".repeat(32),
      savedAt: 1,
      method: "file-system-access",
    });
    hookState.current = { ...IDLE_HOOK_STATE, delivered: true };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(screen.queryByTestId("artifact-unverified-notice")).toBeNull();
  });

  it("shows the not-saved size over a receipt when the repeat download failed", () => {
    saveArtifactDownloadReceipt(COMMON_PROPS.vaultId, {
      version: 1,
      peginTxid: "pegin",
      filename: "babylon-vault-pegin.tar",
      byteLength: 1,
      sha256: "cc".repeat(32),
      savedAt: 1,
      method: "file-system-access",
    });
    hookState.current = {
      ...IDLE_HOOK_STATE,
      error: COPY.deposit.recoveryArtifacts.downloadFailed,
    };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.cardSize),
    ).toBeTruthy();
    expect(
      screen.queryByText(COPY.deposit.recoveryArtifacts.cardSizeDownloaded),
    ).toBeNull();
  });

  it("says an unchecked fallback save cannot be confirmed without promising a fix", () => {
    expect(isFileSystemAccessSupported()).toBe(false);
    hookState.current = {
      ...IDLE_HOOK_STATE,
      delivered: true,
      graphUnchecked: true,
    };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(
      screen.getByText(
        COPY.deposit.recoveryArtifacts.uncheckedUnverifiedSaveNotice,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(COPY.deposit.recoveryArtifacts.unverifiedSaveNotice),
    ).toBeNull();
  });

  it("shows only the unchecked note for an unchecked save to a chosen file", () => {
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    hookState.current = {
      ...IDLE_HOOK_STATE,
      delivered: true,
      graphUnchecked: true,
    };

    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(
      screen.getByText(COPY.deposit.recoveryArtifacts.uncheckedGraphNotice),
    ).toBeTruthy();
    expect(
      screen.queryByText(COPY.deposit.recoveryArtifacts.unverifiedSaveTitle),
    ).toBeNull();
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
