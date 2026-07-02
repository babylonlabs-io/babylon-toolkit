import {
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/rpc", () => ({
  getVpProxyUrl: (address: string) => `https://proxy.example.com/vp/${address}`,
}));

import { fetchAndDownloadArtifacts } from "../artifactDownloadService";

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
});
