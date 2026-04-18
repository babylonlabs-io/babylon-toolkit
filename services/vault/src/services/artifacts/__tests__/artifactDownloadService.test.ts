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

const VALID_ARTIFACT_RESULT = {
  tx_graph_json: "{}",
  verifying_key_hex: "aabb",
  babe_sessions: {
    challenger1: { decryptor_artifacts_hex: "ccdd" },
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
});
