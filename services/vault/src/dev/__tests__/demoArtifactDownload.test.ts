import { derivePeginVaultId } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import {
  ArtifactDownloadCancelledError,
  type ArtifactSaveTarget,
} from "@/services/artifacts";

import {
  demoFetchAndDownloadArtifacts,
  setArtifactDownloadScenario,
} from "../demoArtifactDownload";

const REQUEST = {
  peginTxid: "aa".repeat(32),
  depositorPk: "bb".repeat(32),
  providerAddress: "0x" + "34".repeat(20),
  depositorEthAddress: undefined,
};
const DEMO_DEPOSITOR_ETH_ADDRESS = "0x" + "00".repeat(19) + "01";
const DEMO_SESSION_NAME = `sessions/${"ab".repeat(32)}.cbor`;
/** A full kit hashes the 8 MB session two or three times; fake timers do not skip CPU work. */
const FULL_KIT_TIMEOUT_MS = 20_000;

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
    filename: "demo.tar",
    maxBytes: Number.POSITIVE_INFINITY,
    open: vi.fn(async () => ({ write, commit, discard })),
  };
  return { target, write, commit, discard, written };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Walks a ustar archive independently of the writer and checks the trailer. */
function parseTar(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const entries: { name: string; data: Uint8Array }[] = [];
  let offset = 0;
  for (;;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const nameEnd = header.indexOf(0);
    const name = new TextDecoder().decode(
      header.subarray(0, nameEnd === -1 || nameEnd > 100 ? 100 : nameEnd),
    );
    const size = parseInt(
      new TextDecoder().decode(header.subarray(124, 135)),
      8,
    );
    const start = offset + 512;
    entries.push({ name, data: bytes.slice(start, start + size) });
    offset = start + Math.ceil(size / 512) * 512;
  }
  expect(bytes.byteLength - offset).toBe(1024);
  expect(bytes.subarray(offset).every((b) => b === 0)).toBe(true);
  return entries;
}

type Settled =
  | { ok: true; value: unknown; settledAt: number }
  | { ok: false; error: unknown; settledAt: number };

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
  async function run(promise: Promise<unknown>): Promise<Settled> {
    const settled = promise.then(
      (value) => ({ ok: true, value, settledAt: Date.now() }) as const,
      (error) => ({ ok: false, error, settledAt: Date.now() }) as const,
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  const claimOf = (written: Uint8Array[]) =>
    JSON.parse(new TextDecoder().decode(parseTar(concat(written))[1]!.data));

  it(
    "streams a valid kit through the real pipeline and commits a tar ending in claim.json",
    async () => {
      const { target, commit, discard, written } = fakeSaveTarget();
      const onProgress = vi.fn();

      const result = await run(
        demoFetchAndDownloadArtifacts(target, REQUEST, { onProgress }),
      );

      expect(result).toMatchObject({ ok: true, value: undefined });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(discard).not.toHaveBeenCalled();
      const entries = parseTar(concat(written));
      expect(entries.map((e) => e.name)).toEqual([
        DEMO_SESSION_NAME,
        "claim.json",
      ]);
      expect(claimOf(written).vault_id).toBe(
        "0x" +
          derivePeginVaultId(REQUEST.peginTxid, DEMO_DEPOSITOR_ETH_ADDRESS),
      );
      // Paced, not one blob: progress moves through the session.
      const received = onProgress.mock.calls.map(([bytes]) => bytes as number);
      expect(new Set(received).size).toBeGreaterThan(2);
      expect(received).toEqual([...received].sort((a, b) => a - b));
    },
    FULL_KIT_TIMEOUT_MS,
  );

  it(
    "uses the wallet address when the request carries one",
    async () => {
      const wallet = "0x" + "12".repeat(20);
      const { target, written } = fakeSaveTarget();

      await run(
        demoFetchAndDownloadArtifacts(target, {
          ...REQUEST,
          depositorEthAddress: wallet,
        }),
      );

      expect(claimOf(written).vault_id).toBe(
        "0x" + derivePeginVaultId(REQUEST.peginTxid, wallet),
      );
    },
    FULL_KIT_TIMEOUT_MS,
  );

  it.each([
    "truncated",
    "bad-manifest",
    "provider-error",
    "corrupt-session",
    "wrong-vault",
  ] as const)("%s fails without committing", async (scenario) => {
    setArtifactDownloadScenario(scenario);
    const { target, commit } = fakeSaveTarget();

    const result = await run(demoFetchAndDownloadArtifacts(target, REQUEST));

    expect(result.ok).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it("provider-error surfaces the quota copy promptly", async () => {
    setArtifactDownloadScenario("provider-error");
    const { target } = fakeSaveTarget();
    const startedAt = Date.now();

    const result = await run(demoFetchAndDownloadArtifacts(target, REQUEST));

    expect(result.ok).toBe(false);
    expect((result as { error: Error }).error.message).toBe(
      COPY.deposit.recoveryArtifacts.downloadLimitReached,
    );
    expect(result.settledAt - startedAt).toBeLessThan(5_000);
  });

  it.each(["wrong-vault", "bad-manifest"] as const)(
    "%s fails before the sink opens",
    async (scenario) => {
      setArtifactDownloadScenario(scenario);
      const { target } = fakeSaveTarget();

      await run(demoFetchAndDownloadArtifacts(target, REQUEST));

      expect(target.open).not.toHaveBeenCalled();
    },
  );

  it("truncated fails with the download-failed copy after one resume", async () => {
    setArtifactDownloadScenario("truncated");
    const { target, discard } = fakeSaveTarget();

    const result = await run(demoFetchAndDownloadArtifacts(target, REQUEST));

    expect(result.ok).toBe(false);
    expect((result as { error: Error }).error).toEqual(
      new Error(COPY.deposit.recoveryArtifacts.downloadFailedHttp(416, "")),
    );
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("corrupt-session never writes the session", async () => {
    setArtifactDownloadScenario("corrupt-session");
    const { target, write, discard } = fakeSaveTarget();

    const result = await run(demoFetchAndDownloadArtifacts(target, REQUEST));

    expect(result.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("throws the cancellation sentinel when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { target, commit } = fakeSaveTarget();

    const result = await run(
      demoFetchAndDownloadArtifacts(target, REQUEST, {
        signal: controller.signal,
      }),
    );

    expect(result.ok).toBe(false);
    expect((result as { error: unknown }).error).toBeInstanceOf(
      ArtifactDownloadCancelledError,
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it("honours cancellation between chunks and stops the paced stream", async () => {
    const { target, write, commit, discard } = fakeSaveTarget();
    let cancelled = false;
    const onProgress = vi.fn((received: number) => {
      if (received > 0) cancelled = true;
    });

    const result = await run(
      demoFetchAndDownloadArtifacts(target, REQUEST, {
        isCancelled: () => cancelled,
        onProgress,
      }),
    );

    expect(result.ok).toBe(false);
    expect((result as { error: unknown }).error).toBeInstanceOf(
      ArtifactDownloadCancelledError,
    );
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    const writes = write.mock.calls.length;
    const reports = onProgress.mock.calls.length;
    await vi.runAllTimersAsync();
    expect(write.mock.calls.length).toBe(writes);
    expect(onProgress.mock.calls.length).toBe(reports);
  });
});
