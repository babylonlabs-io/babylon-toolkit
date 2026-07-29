import {
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/rpc", () => ({
  getVpProxyUrl: (address: string) => `https://proxy.example.com/vp/${address}`,
}));

import { fetchAndDownloadArtifacts } from "../artifactDownloadService";
import type { ArtifactSaveTarget } from "../artifactSaveTarget";
import { openArtifactSaveTarget } from "../artifactSaveTarget";
import {
  ArtifactDownloadCancelledError,
  ArtifactDownloadTooLargeError,
  ArtifactFileAccessError,
} from "../errors";

const PROVIDER_ADDRESS = "0x0000000000000000000000000000000000000000";
const PEGIN_TXID =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEPOSITOR_PK =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CHALLENGER_PUBKEY =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

/**
 * Mirrors a real bundle's tx graph: claim and payout spend outputs of the
 * requested pegin, and the challenger set matches the supplied sessions.
 * Without this the bundle is schema-valid but unbound, which the service
 * now rejects.
 */
function txGraphJson(
  overrides: Record<string, unknown> = {},
  peginTxid = PEGIN_TXID,
): string {
  const spend = (vout: number) => ({
    tx: { input: [{ previous_output: `${peginTxid}:${vout}` }] },
  });
  return JSON.stringify({
    claim_tx: spend(1),
    payout_tx: spend(0),
    depositor_pubkey: DEPOSITOR_PK,
    challenger_pubkeys: { local: [CHALLENGER_PUBKEY], universal: [] },
    ...overrides,
  });
}

const VALID_ARTIFACT_RESULT = {
  tx_graph_json: txGraphJson(),
  verifying_key_hex: "aabb",
  babe_sessions: {
    [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "ccdd" },
  },
};

function validEnvelope(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    result: VALID_ARTIFACT_RESULT,
    id: 1,
  });
}

/**
 * Build a Response backed by a real ReadableStream, with Content-Length only
 * when asked. A stream body never auto-populates the header, which is what
 * lets the header-absent fallback be tested deterministically.
 * `chunkSizeBytes` splits the body so multi-chunk paths are exercised.
 */
function streamingResponse(
  body: string,
  {
    withContentLength = false,
    chunkSizeBytes,
  }: { withContentLength?: boolean; chunkSizeBytes?: number } = {},
): Response {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const size = chunkSizeBytes ?? bytes.byteLength;
      for (let offset = 0; offset < bytes.byteLength; offset += size) {
        controller.enqueue(bytes.subarray(offset, offset + size));
      }
      controller.close();
    },
  });
  const headers = new Headers({ "Content-Type": "application/json" });
  if (withContentLength) {
    headers.set("Content-Length", String(bytes.byteLength));
  }
  return new Response(stream, { status: 200, headers });
}

/** A Response whose stream ends early, as a destroyed connection would. */
function truncatedResponse(body: string, keepBytes: number): Response {
  const bytes = new TextEncoder().encode(body).subarray(0, keepBytes);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/** Records everything the service does to its save target. */
function fakeSaveTarget(
  overrides: Partial<Pick<ArtifactSaveTarget, "method" | "maxBytes">> = {},
) {
  const written: Uint8Array[] = [];
  const write = vi.fn(async (chunk: Uint8Array<ArrayBuffer>) => {
    written.push(chunk);
  });
  const commit = vi.fn(async () => undefined);
  const discard = vi.fn(async () => undefined);
  const target: ArtifactSaveTarget = {
    method: "file-system-access",
    filename: "babylon-vault-artifacts-aaaaaaaa.json",
    maxBytes: Number.POSITIVE_INFINITY,
    open: vi.fn(async () => ({ write, commit, discard })),
    ...overrides,
  };
  const savedBytes = () =>
    new Uint8Array(written.flatMap((chunk) => Array.from(chunk)));
  return { target, write, commit, discard, savedBytes };
}

describe("fetchAndDownloadArtifacts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("a valid response", () => {
    it("writes the whole body and commits it", async () => {
      const body = validEnvelope();
      vi.mocked(fetch).mockResolvedValueOnce(streamingResponse(body));
      const { target, commit, discard, savedBytes } = fakeSaveTarget();

      await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
      );

      expect(new TextDecoder().decode(savedBytes())).toBe(body);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(discard).not.toHaveBeenCalled();
    });

    it("returns a receipt describing what was saved", async () => {
      const body = validEnvelope();
      const byteLength = new TextEncoder().encode(body).byteLength;
      vi.mocked(fetch).mockResolvedValueOnce(streamingResponse(body));
      const { target } = fakeSaveTarget();

      const outcome = await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
      );

      expect(outcome).toEqual({
        filename: "babylon-vault-artifacts-aaaaaaaa.json",
        byteLength,
        sha256: bytesToHex(sha256(new TextEncoder().encode(body))),
        method: "file-system-access",
      });
    });

    it("reassembles a body split across many chunks", async () => {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        result: {
          ...VALID_ARTIFACT_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: {
              decryptor_artifacts_hex: "ab".repeat(20_000),
            },
          },
        },
        id: 1,
      });
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(body, { chunkSizeBytes: 997 }),
      );
      const { target, savedBytes } = fakeSaveTarget();

      await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
      );

      expect(new TextDecoder().decode(savedBytes())).toBe(body);
    });

    it("accepts a result body that nests an error key", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              ...VALID_ARTIFACT_RESULT,
              tx_graph_json: txGraphJson({ error: "not the envelope's" }),
            },
            id: 1,
          }),
        ),
      );
      const { target, commit } = fakeSaveTarget();

      await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
      );

      expect(commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalid responses discard rather than commit", () => {
    const cases: [name: string, body: string][] = [
      ["non-JSON garbage", "<html>gateway timeout</html>".repeat(500)],
      ["a missing result", JSON.stringify({ jsonrpc: "2.0", id: 1 })],
      [
        "an empty result",
        JSON.stringify({ jsonrpc: "2.0", result: {}, id: 1 }),
      ],
      [
        "an empty tx_graph_json",
        JSON.stringify({
          jsonrpc: "2.0",
          result: { ...VALID_ARTIFACT_RESULT, tx_graph_json: "" },
          id: 1,
        }),
      ],
      [
        "a tx_graph_json that is not a JSON object",
        JSON.stringify({
          jsonrpc: "2.0",
          result: { ...VALID_ARTIFACT_RESULT, tx_graph_json: "garbage" },
          id: 1,
        }),
      ],
      [
        "a non-hex verifying_key_hex",
        JSON.stringify({
          jsonrpc: "2.0",
          result: { ...VALID_ARTIFACT_RESULT, verifying_key_hex: "zzzz" },
          id: 1,
        }),
      ],
      [
        "a non-hex decryptor_artifacts_hex",
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            ...VALID_ARTIFACT_RESULT,
            babe_sessions: {
              [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "zzzz" },
            },
          },
          id: 1,
        }),
      ],
      [
        "empty babe_sessions",
        JSON.stringify({
          jsonrpc: "2.0",
          result: { ...VALID_ARTIFACT_RESULT, babe_sessions: {} },
          id: 1,
        }),
      ],
      [
        "a session keyed by something other than a pubkey",
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            ...VALID_ARTIFACT_RESULT,
            babe_sessions: { label: { decryptor_artifacts_hex: "ccdd" } },
          },
          id: 1,
        }),
      ],
    ];

    for (const [name, body] of cases) {
      it(`rejects ${name}`, async () => {
        vi.mocked(fetch).mockResolvedValueOnce(streamingResponse(body));
        const { target, commit, discard } = fakeSaveTarget();

        await expect(
          fetchAndDownloadArtifacts(
            PROVIDER_ADDRESS,
            PEGIN_TXID,
            DEPOSITOR_PK,
            target,
          ),
        ).rejects.toBeInstanceOf(VpResponseValidationError);
        expect(commit).not.toHaveBeenCalled();
        expect(discard).toHaveBeenCalledTimes(1);
      });
    }

    it("rejects a truncated stream", async () => {
      // The proxy signals a mid-stream backend failure by destroying the
      // connection, so a half-received bundle arrives as valid-looking bytes
      // that simply stop. Nothing distinguishes it but the missing tail.
      const body = validEnvelope();
      vi.mocked(fetch).mockResolvedValueOnce(
        truncatedResponse(body, body.length - 10),
      );
      const { target, commit, discard } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(VpResponseValidationError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("rejects a schema-valid bundle built for a different deposit", async () => {
      // The envelope names no deposit, so a provider can return a perfectly
      // well-formed bundle belonging to someone else. Only the tx graph
      // distinguishes them.
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              ...VALID_ARTIFACT_RESULT,
              tx_graph_json: txGraphJson({}, "ff".repeat(32)),
            },
            id: 1,
          }),
        ),
      );
      const { target, commit, discard } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(VpResponseValidationError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("rejects a bundle whose sessions do not cover the graph's challengers", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              ...VALID_ARTIFACT_RESULT,
              tx_graph_json: txGraphJson({
                challenger_pubkeys: {
                  local: [CHALLENGER_PUBKEY],
                  // Declared by the graph but never given a session, so the
                  // depositor would be missing recovery material for it.
                  universal: ["ee".repeat(32)],
                },
              }),
            },
            id: 1,
          }),
        ),
      );
      const { target, commit, discard } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(VpResponseValidationError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("rejects a garbage body far larger than any prefix window", async () => {
      // Previously anything at or above 4096 bytes skipped body validation
      // entirely, so a large junk payload downloaded "successfully".
      const body = JSON.stringify({
        jsonrpc: "2.0",
        result: { junk: "x".repeat(200_000) },
        id: 1,
      });
      vi.mocked(fetch).mockResolvedValueOnce(streamingResponse(body));
      const { target, commit, discard } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(VpResponseValidationError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });
  });

  describe("JSON-RPC error envelopes", () => {
    it("surfaces RPC error responses as JsonRpcError", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32011, message: "Invalid state: PendingBabeSetup" },
            id: 1,
          }),
        ),
      );
      const { target, commit, discard } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(JsonRpcError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("propagates wire source and structured error.data", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "auth token expired",
              data: { kind: "auth_expired", expiresAt: 1700000000 },
            },
            id: 1,
          }),
        ),
      );
      const { target } = fakeSaveTarget();

      const err = await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
      ).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(JsonRpcError);
      const jsonRpcErr = err as JsonRpcError;
      expect(jsonRpcErr.source).toBe("wire");
      expect(jsonRpcErr.data).toEqual({
        kind: "auth_expired",
        expiresAt: 1700000000,
      });
    });

    it("surfaces a padded error envelope as JsonRpcError, not a payload", async () => {
      // Padding past the old 4096-byte threshold used to route an error
      // envelope down the unvalidated large-payload branch, which also cost
      // the caller its auth-expired retry (that only triggers on
      // JsonRpcError). Size no longer changes the verdict.
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "auth token expired",
              data: { kind: "auth_expired", padding: "x".repeat(10_000) },
            },
            id: 1,
          }),
        ),
      );
      const { target } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(JsonRpcError);
    });

    it("fails closed on an error object too large to be plausible", async () => {
      // Beyond the error-value cap we stop buffering and reject outright
      // rather than let an unbounded "error" be used as a memory sink. The
      // download fails either way; only the error type differs.
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32011, message: "x".repeat(200_000) },
            id: 1,
          }),
        ),
      );
      const { target, commit } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(VpResponseValidationError);
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe("progress reporting", () => {
    it("reports progress against Content-Length when present", async () => {
      const body = validEnvelope();
      const byteLength = new TextEncoder().encode(body).byteLength;
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(body, { withContentLength: true }),
      );
      const onProgress = vi.fn();
      const { target } = fakeSaveTarget();

      await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
        { onProgress },
      );

      expect(onProgress).toHaveBeenLastCalledWith(byteLength, byteLength);
    });

    it("falls back to an estimated total when Content-Length is absent", async () => {
      const body = validEnvelope();
      const byteLength = new TextEncoder().encode(body).byteLength;
      vi.mocked(fetch).mockResolvedValueOnce(streamingResponse(body));
      const onProgress = vi.fn();
      const { target } = fakeSaveTarget();

      await fetchAndDownloadArtifacts(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
        target,
        { onProgress },
      );

      const [received, total] = onProgress.mock.calls.at(-1)!;
      expect(received).toBe(byteLength);
      expect(total).toBeGreaterThan(byteLength);
    });
  });

  describe("cancellation", () => {
    it("throws the sentinel and discards when isCancelled is set", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(validEnvelope(), { withContentLength: true }),
      );
      const { target, commit, discard } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
          { isCancelled: () => true },
        ),
      ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("maps an aborted request to the sentinel", async () => {
      const controller = new AbortController();
      controller.abort();
      vi.mocked(fetch).mockRejectedValue(
        new DOMException("The operation was aborted.", "AbortError"),
      );
      const { target, commit } = fakeSaveTarget();

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
          { signal: controller.signal },
        ),
      ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe("save-target failures", () => {
    it("rejects a body larger than the target can hold", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(validEnvelope()),
      );
      const { target, commit, discard } = fakeSaveTarget({ maxBytes: 8 });

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(ArtifactDownloadTooLargeError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("discards the writable when the final commit fails", async () => {
      // A rejected close leaves the transaction open, so its temporary file
      // would otherwise linger until the browser reclaims it.
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(validEnvelope()),
      );
      const { target, commit, discard } = fakeSaveTarget();
      commit.mockRejectedValueOnce(
        new ArtifactFileAccessError("close failed", {
          cause: new Error("EIO"),
        }),
      );

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(ArtifactFileAccessError);
      expect(discard).toHaveBeenCalledTimes(1);
    });

    it("surfaces a write failure and discards the partial file", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        streamingResponse(validEnvelope()),
      );
      const { target, write, commit, discard } = fakeSaveTarget();
      write.mockRejectedValueOnce(
        new ArtifactFileAccessError("disk full", {
          cause: new Error("ENOSPC"),
        }),
      );

      await expect(
        fetchAndDownloadArtifacts(
          PROVIDER_ADDRESS,
          PEGIN_TXID,
          DEPOSITOR_PK,
          target,
        ),
      ).rejects.toBeInstanceOf(ArtifactFileAccessError);
      expect(commit).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
    });
  });
});

describe("openArtifactSaveTarget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubSecureContext(isSecure: boolean) {
    Object.defineProperty(window, "isSecureContext", {
      value: isSecure,
      configurable: true,
    });
  }

  it("returns a streaming target when the File System Access API is present", async () => {
    stubSecureContext(true);
    const writable = { write: vi.fn(), close: vi.fn(), abort: vi.fn() };
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => ({ createWritable: vi.fn(async () => writable) })),
    );

    const target = await openArtifactSaveTarget(`0x${PEGIN_TXID}`);

    expect(target.method).toBe("file-system-access");
    expect(target.filename).toBe("babylon-vault-artifacts-aaaaaaaa.json");
    expect(target.maxBytes).toBe(Number.POSITIVE_INFINITY);
  });

  it("maps a dismissed picker to the cancellation sentinel", async () => {
    stubSecureContext(true);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new DOMException("The user aborted a request.", "AbortError");
      }),
    );

    await expect(openArtifactSaveTarget(PEGIN_TXID)).rejects.toBeInstanceOf(
      ArtifactDownloadCancelledError,
    );
  });

  it("maps a denied picker to a file-access error", async () => {
    stubSecureContext(true);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new DOMException("Permission denied.", "NotAllowedError");
      }),
    );

    await expect(openArtifactSaveTarget(PEGIN_TXID)).rejects.toBeInstanceOf(
      ArtifactFileAccessError,
    );
  });

  it("falls back to an anchor download with a size ceiling when unsupported", async () => {
    stubSecureContext(true);
    vi.stubGlobal("showSaveFilePicker", undefined);

    const target = await openArtifactSaveTarget(PEGIN_TXID);

    expect(target.method).toBe("browser-download");
    // A full-size bundle cannot be held as a Blob, so the fallback refuses it
    // loudly rather than killing the tab.
    expect(target.maxBytes).toBeLessThan(1_000_000_000);
  });

  it("falls back when the page is not a secure context", async () => {
    stubSecureContext(false);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => ({ createWritable: vi.fn() })),
    );

    const target = await openArtifactSaveTarget(PEGIN_TXID);

    expect(target.method).toBe("browser-download");
  });
});
