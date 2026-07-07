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
 * test the header-absent fallback deterministically.
 */
function streamingResponse(
  body: string,
  { withContentLength = false }: { withContentLength?: boolean } = {},
): Response {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
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

  it("skips parsing for payloads above the error-size threshold and triggers download", async () => {
    const largeBody = "x".repeat(8192);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(largeBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetchAndDownloadArtifacts(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
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
