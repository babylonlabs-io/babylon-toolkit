import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ArtifactDownloadContent } from "../ArtifactDownloadContent";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Loader: () => <div data-testid="loader" />,
}));

describe("ArtifactDownloadContent", () => {
  it("renders received over total bytes and the percent while a sized download streams", () => {
    render(
      <ArtifactDownloadContent
        receivedBytes={742_000_000}
        totalBytes={1_000_000_000}
        status=""
      />,
    );

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
    render(
      <ArtifactDownloadContent
        receivedBytes={1_400_000_000}
        totalBytes={1_300_000_000}
        status=""
      />,
    );

    const bytesRow = screen.getByText("1.30 GB").parentElement;
    expect(bytesRow?.textContent).toBe("1.30 GB / 1.30 GB");
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
  });

  it("falls back to the loader chip with the status line while the total is unknown", () => {
    render(
      <ArtifactDownloadContent
        receivedBytes={0}
        totalBytes={0}
        status="Fetching artifacts from vault provider..."
      />,
    );

    expect(screen.getByTestId("loader")).toBeTruthy();
    expect(
      screen.getByText("Fetching artifacts from vault provider..."),
    ).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("names the download in its own title and description", () => {
    render(
      <ArtifactDownloadContent
        receivedBytes={0}
        totalBytes={1_000_000_000}
        status=""
      />,
    );

    expect(screen.getByText("Downloading BTCVault artifacts")).toBeTruthy();
    expect(
      screen.getByText(
        "This may take a few minutes depending on your connection.",
      ),
    ).toBeTruthy();
  });
});
