import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactDownloadCancelledError } from "@/services/artifacts";

import { demoFetchAndDownloadArtifacts } from "../demoArtifactDownload";

describe("demoFetchAndDownloadArtifacts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports monotonic byte progress up to the full simulated total", async () => {
    const onProgress = vi.fn();
    const promise = demoFetchAndDownloadArtifacts(
      "0xprovider",
      "0xtxid",
      "0xpk",
      { onProgress },
    );

    await vi.runAllTimersAsync();
    await promise;

    const received = onProgress.mock.calls.map(
      ([receivedBytes]) => receivedBytes as number,
    );
    expect(received.at(-1)).toBe(1_000_000_000);
    for (let i = 1; i < received.length; i++) {
      expect(received[i]).toBeGreaterThanOrEqual(received[i - 1]);
    }
    expect(
      onProgress.mock.calls.every(
        ([, totalBytes]) => totalBytes === 1_000_000_000,
      ),
    ).toBe(true);
  });

  it("throws the cancellation sentinel when the signal aborts mid-simulation", async () => {
    const abortController = new AbortController();
    // Cancel as soon as the first progress tick lands.
    const onProgress = vi.fn(() => abortController.abort());
    const promise = demoFetchAndDownloadArtifacts(
      "0xprovider",
      "0xtxid",
      "0xpk",
      { signal: abortController.signal, onProgress },
    );

    const assertion = expect(promise).rejects.toBeInstanceOf(
      ArtifactDownloadCancelledError,
    );
    await vi.runAllTimersAsync();
    await assertion;
  });
});
