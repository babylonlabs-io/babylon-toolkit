import { fireEvent, render, screen } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { saveArtifactDownloadReceipt } from "@/utils/artifactDownloadStorage";

import { ArtifactDownloadModal } from "../ArtifactDownloadModal";

const IDLE_HOOK_STATE = {
  loading: false,
  progress: "",
  error: null as string | null,
  downloaded: false,
  delivered: false,
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

vi.mock("@babylonlabs-io/wallet-connector/btc-eth", () => ({
  useChainConnector: () => null,
}));

const VAULT_ID = `0x${"aa".repeat(32)}` as Hex;
const PEGIN_TXID = "bb".repeat(32);
const PARAMS = {
  vaultId: VAULT_ID,
  providerAddress: "0xprovider",
  peginTxid: `0x${PEGIN_TXID}`,
  depositorPk: "0xpk",
  unsignedPrePeginTxHex: "0200",
} as const;

function saveReceipt() {
  saveArtifactDownloadReceipt(VAULT_ID, {
    version: 1,
    peginTxid: PEGIN_TXID,
    filename: "artifacts.json",
    byteLength: 1,
    sha256: "cc".repeat(32),
    savedAt: 1,
    method: "browser-download",
  });
}

describe("ArtifactDownloadModal with saved artifacts", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE, download: vi.fn() };
  });

  it("starts a new download from the downloaded state", () => {
    saveReceipt();
    render(<ArtifactDownloadModal {...PARAMS} onClose={vi.fn()} />);

    expect(
      screen.getByText(COPY.deposit.artifactDownload.titleDownloaded),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.deposit.artifactDownload.downloadAgainButton,
      }),
    );

    expect(hookState.current.download).toHaveBeenCalledWith(
      PARAMS.providerAddress,
      PARAMS.peginTxid,
      PARAMS.depositorPk,
    );
  });

  it("does not present a failed repeat download as saved", () => {
    saveReceipt();
    hookState.current = {
      ...IDLE_HOOK_STATE,
      error: "The vault provider could not be reached.",
    };
    render(<ArtifactDownloadModal {...PARAMS} onClose={vi.fn()} />);

    expect(
      screen.getByText(COPY.deposit.artifactDownload.title),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.artifactDownload.titleDownloaded),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("The vault provider could not be reached."),
    ).toBeInTheDocument();
  });
});
