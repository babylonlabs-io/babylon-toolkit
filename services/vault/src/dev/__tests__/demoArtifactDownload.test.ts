import { VpResponseValidationError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactDownloadCancelledError,
  type ArtifactSaveTarget,
} from "@/services/artifacts";

import {
  demoFetchAndDownloadArtifacts,
  setArtifactDownloadScenario,
} from "../demoArtifactDownload";

const BINDING = {
  peginTxid: "aa".repeat(32),
  depositorPk: "bb".repeat(32),
};

/** Records what the demo writes, the same way the real service's target does. */
function fakeSaveTarget() {
  const written: Uint8Array[] = [];
  const write = vi.fn(async (chunk: Uint8Array<ArrayBuffer>) => {
    written.push(chunk);
  });
  const commit = vi.fn(async () => undefined);
  const discard = vi.fn(async () => undefined);
  const target: ArtifactSaveTarget = {
    method: "file-system-access",
    filename: "demo.json",
    maxBytes: Number.POSITIVE_INFINITY,
    open: vi.fn(async () => ({ write, commit, discard })),
  };
  return { target, write, commit, discard, written };
}

describe("demoFetchAndDownloadArtifacts", () => {
  beforeEach(() => {
    setArtifactDownloadScenario("valid");
    // The mock paces itself to be watchable in a browser; fake timers keep
    // that from costing ~12 s per case here.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setArtifactDownloadScenario("valid");
    vi.restoreAllMocks();
  });

  /** Drive the mock's paced stream to completion under fake timers. */
  async function run(promise: Promise<unknown>): Promise<unknown> {
    const settled = promise.then(
      (value) => ({ ok: true, value }) as const,
      (error) => ({ ok: false, error }) as const,
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  it("streams a valid bundle through the real pipeline and commits it", async () => {
    const { target, commit, discard, written } = fakeSaveTarget();
    const onProgress = vi.fn();

    await run(demoFetchAndDownloadArtifacts(target, BINDING, { onProgress }));

    expect(commit).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
    // Many chunks, not one blob — the point of the mock is to exercise the
    // streaming path rather than hand the sink a finished buffer.
    expect(written.length).toBeGreaterThan(1);

    const received = onProgress.mock.calls.map(([bytes]) => bytes as number);
    for (let i = 1; i < received.length; i++) {
      expect(received[i]).toBeGreaterThanOrEqual(received[i - 1]);
    }
  });

  it.each([["truncated"], ["garbage"], ["non-hex"], ["wrong-vault"]] as const)(
    "rejects the %s scenario and discards the partial file",
    async (scenario) => {
      setArtifactDownloadScenario(scenario);
      const { target, commit, discard } = fakeSaveTarget();

      const outcome = (await run(
        demoFetchAndDownloadArtifacts(target, BINDING, {}),
      )) as { ok: boolean; error?: unknown };

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBeInstanceOf(VpResponseValidationError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    },
  );

  it("throws the cancellation sentinel when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { target, commit } = fakeSaveTarget();

    const outcome = (await run(
      demoFetchAndDownloadArtifacts(target, BINDING, {
        signal: controller.signal,
      }),
    )) as { ok: boolean; error?: unknown };

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(commit).not.toHaveBeenCalled();
  });

  it("throws the cancellation sentinel when cancelled mid-stream", async () => {
    const { target, commit } = fakeSaveTarget();
    let chunks = 0;
    // Cancel once bytes are genuinely flowing, not before the stream starts.
    const isCancelled = () => ++chunks > 3;

    const outcome = (await run(
      demoFetchAndDownloadArtifacts(target, BINDING, { isCancelled }),
    )) as { ok: boolean; error?: unknown };

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(commit).not.toHaveBeenCalled();
  });
});
