import {
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/rpc", () => ({
  getVpProxyUrl: (address: string) => `https://proxy.example.com/vp/${address}`,
}));

import {
  ArtifactDownloadCancelledError,
  fetchAndDownloadArtifacts,
} from "../artifactDownloadService";

const PROVIDER_ADDRESS = "0x0000000000000000000000000000000000000000";
const PEGIN_TXID =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEPOSITOR_PK =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CHALLENGER_PUBKEY =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const VALID_ARTIFACT_RESULT = {
  tx_graph_json: "{}",
  verifying_key_hex: "aabb",
  babe_sessions: {
    [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "ccdd" },
  },
};

function responseFor(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Build a Response backed by a real ReadableStream so the streaming path
 * (readBodyWithProgress) is exercised, with Content-Length present only when
 * asked. A stream body never auto-populates Content-Length, which lets us
 * test the header-absent fallback deterministically. `chunkSizeBytes` splits
 * the body across multiple stream chunks (default: one chunk) so multi-chunk
 * assembly paths can be exercised.
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

describe("fetchAndDownloadArtifacts", () => {
  const triggerDownloadSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());

    // Spy on the DOM bits that triggerBlobDownload uses so we can assert
    // whether a download was actually triggered without writing a file.
    const anchor = document.createElement("a");
    anchor.click = triggerDownloadSpy;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node as Node,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node as Node,
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    triggerDownloadSpy.mockReset();
  });

  it("triggers download after successful validation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({ jsonrpc: "2.0", result: VALID_ARTIFACT_RESULT, id: 1 }),
    );

    await fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers download for a large success envelope without full parsing", async () => {
    // Above ERROR_RESPONSE_SIZE_THRESHOLD: the body is not schema-validated,
    // but the envelope prefix is checked and looks like a JSON-RPC success.
    const largeResult = {
      ...VALID_ARTIFACT_RESULT,
      verifying_key_hex: "ab".repeat(4096),
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({ jsonrpc: "2.0", result: largeResult, id: 1 }),
    );

    await fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers download for a large success envelope whose body nests error keys", async () => {
    // The prefix scan counts only top-level envelope keys: `"error":`
    // appearing inside the result body is artifact data, not an error
    // envelope, and must not fail the download.
    const largeResult = {
      ...VALID_ARTIFACT_RESULT,
      metadata: { error: "artifact body text, not an envelope error" },
      padding: "x".repeat(8192),
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({ jsonrpc: "2.0", result: largeResult, id: 1 }),
    );

    await fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers download for a body larger than the validation prefix when result precedes the cut", async () => {
    // Body exceeds PREFIX_VALIDATION_BYTES (64 KiB), so validation sees only
    // the truncated prefix. Streaming in 10 000-byte chunks exercises the
    // prefix-copy loop in readBodyWithProgress across chunk boundaries,
    // including the final-chunk clamp at the 64 KiB cut. The top-level
    // `result` key sits well before the cut, so the envelope reads as
    // success and the full body must still download.
    const body = JSON.stringify({
      jsonrpc: "2.0",
      result: {
        ...VALID_ARTIFACT_RESULT,
        verifying_key_hex: "ab".repeat(48 * 1024),
      },
      id: 1,
    });
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(
      64 * 1024,
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      streamingResponse(body, { chunkSizeBytes: 10_000 }),
    );

    await fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects an error envelope whose top-level keys are padded past the validation prefix", async () => {
    // Padding pushes both the top-level `result` and `error` keys past
    // PREFIX_VALIDATION_BYTES (64 KiB), so the truncated prefix scan sees
    // neither. Missing `result` rejects fail-closed — the padded error must
    // not download as a successful artifact.
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      padding: "x".repeat(80 * 1024),
      result: null,
      error: { code: -32011, message: "hidden past the prefix cut" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      streamingResponse(body, { chunkSizeBytes: 10_000 }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects a large non-JSON payload without triggering download", async () => {
    const garbage = "x".repeat(8192);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(garbage, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects a JSON-RPC error envelope padded past the size threshold", async () => {
    // A malicious VP can pad an error past ERROR_RESPONSE_SIZE_THRESHOLD so it
    // skips the parsed small-response path; the envelope prefix must still
    // catch it instead of downloading it as a successful artifact.
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        error: { code: -32011, message: "x".repeat(8192) },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects a large envelope missing the result field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({ jsonrpc: "2.0", id: 1, padding: "x".repeat(8192) }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects a padded error envelope that also declares result null", async () => {
    // A malicious VP can serialize `result` before `error` so that a
    // first-substring-wins check would classify the envelope as success.
    // A non-null top-level error must reject regardless of key order.
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: null,
        error: { code: -32011, message: "x".repeat(8192) },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects a padded envelope declaring both a result object and an error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: VALID_ARTIFACT_RESULT,
        error: { code: -32011, message: "x".repeat(8192) },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects a padded error envelope whose body nests a result key", async () => {
    // A nested `"result":` before the top-level `error` must not make the
    // envelope read as success — only top-level keys count.
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        meta: { result: "nested, not the envelope result" },
        error: { code: -32011, message: "x".repeat(8192) },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("routes a payload at exactly the size threshold to the prefix validation path", async () => {
    // ERROR_RESPONSE_SIZE_THRESHOLD is 4096 bytes and the size check is
    // inclusive (>=): at exactly 4096 the parsed small-response path must
    // not run, so an error envelope surfaces as the prefix path's
    // VpResponseValidationError rather than a parsed JsonRpcError.
    const errorEnvelope = (message: string) =>
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32011, message },
        id: 1,
      });
    const paddingLength =
      4096 - new TextEncoder().encode(errorEnvelope("")).byteLength;
    const body = errorEnvelope("x".repeat(paddingLength));
    expect(new TextEncoder().encode(body).byteLength).toBe(4096);

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty result object without triggering download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({ jsonrpc: "2.0", result: {}, id: 1 }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects empty tx_graph_json without triggering download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: { ...VALID_ARTIFACT_RESULT, tx_graph_json: "" },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects non-hex verifying_key_hex without triggering download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: { ...VALID_ARTIFACT_RESULT, verifying_key_hex: "not-hex!" },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects babe_sessions entry with non-hex decryptor_artifacts_hex without triggering download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: {
          ...VALID_ARTIFACT_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "not-hex!" },
          },
        },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects empty babe_sessions without triggering download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: { ...VALID_ARTIFACT_RESULT, babe_sessions: {} },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects babe_sessions keyed by an arbitrary non-pubkey label without triggering download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        result: {
          ...VALID_ARTIFACT_RESULT,
          babe_sessions: {
            attacker_label: { decryptor_artifacts_hex: "deadbeef" },
          },
        },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects envelope missing result field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({ jsonrpc: "2.0", id: 1 }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("rejects non-JSON payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("surfaces RPC error responses as JsonRpcError", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        error: { code: -32011, message: "Invalid state: PendingBabeSetup" },
        id: 1,
      }),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK),
    ).rejects.toBeInstanceOf(JsonRpcError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("propagates wire source and structured error.data on RPC error envelopes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "auth token expired",
          data: { kind: "auth_expired", expiresAt: 1700000000 },
        },
        id: 1,
      }),
    );

    const err = await fetchAndDownloadArtifacts(
      PROVIDER_ADDRESS,
      PEGIN_TXID,
      DEPOSITOR_PK,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JsonRpcError);
    const jsonRpcErr = err as JsonRpcError;
    expect(jsonRpcErr.source).toBe("wire");
    expect(jsonRpcErr.data).toEqual({
      kind: "auth_expired",
      expiresAt: 1700000000,
    });
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("streams the body and reports progress against Content-Length", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      result: VALID_ARTIFACT_RESULT,
      id: 1,
    });
    const byteLength = new TextEncoder().encode(body).byteLength;
    vi.mocked(fetch).mockResolvedValueOnce(
      streamingResponse(body, { withContentLength: true }),
    );
    const onProgress = vi.fn();

    await fetchAndDownloadArtifacts(
      PROVIDER_ADDRESS,
      PEGIN_TXID,
      DEPOSITOR_PK,
      {
        onProgress,
      },
    );

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    // Final progress event reports the full payload against the real total.
    expect(onProgress).toHaveBeenLastCalledWith(byteLength, byteLength);
  });

  it("falls back to an estimated total when Content-Length is absent", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      result: VALID_ARTIFACT_RESULT,
      id: 1,
    });
    const byteLength = new TextEncoder().encode(body).byteLength;
    vi.mocked(fetch).mockResolvedValueOnce(streamingResponse(body));
    const onProgress = vi.fn();

    await fetchAndDownloadArtifacts(
      PROVIDER_ADDRESS,
      PEGIN_TXID,
      DEPOSITOR_PK,
      {
        onProgress,
      },
    );

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    const [received, total] = onProgress.mock.calls.at(-1)!;
    expect(received).toBe(byteLength);
    // No header -> total is the fixed fallback estimate, far above the tiny
    // actual payload.
    expect(total).toBeGreaterThan(byteLength);
  });

  it("throws the cancellation sentinel and skips download when isCancelled is set", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      streamingResponse(
        JSON.stringify({
          jsonrpc: "2.0",
          result: VALID_ARTIFACT_RESULT,
          id: 1,
        }),
        { withContentLength: true },
      ),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK, {
        isCancelled: () => true,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });

  it("maps an aborted request to the cancellation sentinel", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    await expect(
      fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
  });
});
