import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoveryArtifactsCard } from "../RecoveryArtifactsCard";

const IDLE_HOOK_STATE = {
  loading: false,
  progress: "",
  error: null as string | null,
  downloaded: false,
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

vi.mock("@babylonlabs-io/core-ui", () => ({
  Loader: () => <div data-testid="loader" />,
}));

const COMMON_PROPS = {
  providerAddress: "0xprovider",
  peginTxid: "0xpegin",
  depositorPk: "0xpk",
  vaultId: "0xabc123",
} as const;

describe("RecoveryArtifactsCard — byte-progress panel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.current = { ...IDLE_HOOK_STATE };
  });

  it("renders received over total bytes and the percent while a sized download streams", () => {
    hookState.current = {
      ...IDLE_HOOK_STATE,
      loading: true,
      receivedBytes: 742_000_000,
      totalBytes: 1_000_000_000,
    };
    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    const bytesRow = screen.getByText("1.00 GB").parentElement;
    expect(bytesRow?.textContent).toBe("742 MB / 1.00 GB");
    expect(screen.getByText("74%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "74",
    );
    expect(
      screen.getByText("Do not close this window while downloading."),
    ).toBeTruthy();
  });

  it("clamps the received bytes and percent at the total when a compressed transfer overshoots Content-Length", () => {
    hookState.current = {
      ...IDLE_HOOK_STATE,
      loading: true,
      receivedBytes: 1_400_000_000,
      totalBytes: 1_300_000_000,
    };
    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    const bytesRow = screen.getByText("1.30 GB").parentElement;
    expect(bytesRow?.textContent).toBe("1.30 GB / 1.30 GB");
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
  });

  it("falls back to the loader chip with the status line while the total is unknown", () => {
    hookState.current = {
      ...IDLE_HOOK_STATE,
      loading: true,
      progress: "Fetching artifacts from vault provider...",
    };
    render(<RecoveryArtifactsCard {...COMMON_PROPS} />);

    expect(screen.getByTestId("loader")).toBeTruthy();
    expect(
      screen.getByText("Fetching artifacts from vault provider..."),
    ).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
