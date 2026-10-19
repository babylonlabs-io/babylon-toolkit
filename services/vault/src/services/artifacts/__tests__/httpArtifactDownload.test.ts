import {
  isAuthRejectedError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactsNotReadyError,
  fetchHttpArtifactsResponse,
} from "../httpArtifactDownload";

const BASE = "https://proxy.example.com/artifacts/0xVP";
const TXID = "ab".repeat(32);
const KEY_A = "11".repeat(32);
const KEY_B = "22".repeat(32);
const SESSION_A = new Uint8Array([1, 2, 3, 4, 5, 6]);
const SESSION_B = new Uint8Array([7, 8, 9]);
const TOKEN = "jsonrpc.bearer";

const etagOf = (bytes: Uint8Array) => `"${bytesToHex(sha256(bytes))}"`;

function manifest(sessions: Record<string, Uint8Array>) {
  return {
    tx_graph_json: '{"graph":true}',
    verifying_key_hex: "abcd",
    babe_sessions: Object.fromEntries(
      Object.entries(sessions).map(([key, bytes]) => [
        key,
        {
          download_path: `/v1/depositor-artifacts/${TXID}/sessions/${key}`,
          byte_length: bytes.byteLength,
        },
      ]),
    ),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sessionResponse(bytes: Uint8Array<ArrayBuffer>) {
  return new Response(bytes, {
    status: 200,
    headers: {
      etag: etagOf(bytes),
      "content-length": String(bytes.byteLength),
    },
  });
}

/** A 200 response whose body breaks after `sent` bytes. */
function brokenSessionResponse(bytes: Uint8Array<ArrayBuffer>, sent: number) {
  let pulls = 0;
  // Error on the second pull: an error in start() would drop the queued chunk.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(bytes.slice(0, sent));
      else controller.error(new TypeError("network error"));
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      etag: etagOf(bytes),
      "content-length": String(bytes.byteLength),
    },
  });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const getToken = () => Promise.resolve(TOKEN);

describe("fetchHttpArtifactsResponse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rebuilds the JSON-RPC artifact response from the manifest and sessions", async () => {
    const fetchMock = mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A, [KEY_B]: SESSION_B })),
      sessionResponse(SESSION_A),
      sessionResponse(SESSION_B),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tx_graph_json: '{"graph":true}',
        verifying_key_hex: "abcd",
        babe_sessions: {
          [KEY_A]: { decryptor_artifacts_hex: bytesToHex(SESSION_A) },
          [KEY_B]: { decryptor_artifacts_hex: bytesToHex(SESSION_B) },
        },
      },
    });
    expect(response.headers.get("content-length")).toBe(
      String(new TextEncoder().encode(text).byteLength),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/${TXID}/manifest`,
      `${BASE}/${TXID}/sessions/${KEY_A}`,
      `${BASE}/${TXID}/sessions/${KEY_B}`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(init.redirect).toBe("error");
    }
  });

  it("resumes a broken session with Range and If-Range", async () => {
    const rest = SESSION_A.slice(4);
    const fetchMock = mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      brokenSessionResponse(SESSION_A, 4),
      new Response(rest, {
        status: 206,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(rest.byteLength),
          "content-range": `bytes 4-5/${SESSION_A.byteLength}`,
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    const result = JSON.parse(await response.text()).result;

    expect(result.babe_sessions[KEY_A].decryptor_artifacts_hex).toBe(
      bytesToHex(SESSION_A),
    );
    expect(fetchMock.mock.calls[2]![1].headers).toMatchObject({
      Range: "bytes=4-",
      "If-Range": etagOf(SESSION_A),
    });
  });

  it("rejects session bytes that do not match the ETag", async () => {
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      new Response(SESSION_A, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_B),
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a manifest that points a session at another path", async () => {
    const bad = manifest({ [KEY_A]: SESSION_A });
    bad.babe_sessions[KEY_A]!.download_path = "/v1/other";
    mockFetch(jsonResponse(bad));

    await expect(
      fetchHttpArtifactsResponse(BASE, TXID, getToken),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it("maps 401 to an auth rejection so the caller re-primes", async () => {
    mockFetch(jsonResponse({ error_name: "UNAUTHENTICATED" }, 401));

    const err = await fetchHttpArtifactsResponse(BASE, TXID, getToken).catch(
      (e: unknown) => e,
    );
    expect(isAuthRejectedError(err)).toBe(true);
  });

  it("maps 409 to ArtifactsNotReadyError", async () => {
    mockFetch(jsonResponse({ error_name: "INVALID_STATE" }, 409));

    await expect(
      fetchHttpArtifactsResponse(BASE, TXID, getToken),
    ).rejects.toThrow(ArtifactsNotReadyError);
  });

  it("sends no Authorization header when no token is cached", async () => {
    const fetchMock = mockFetch(jsonResponse({}, 401));

    await fetchHttpArtifactsResponse(BASE, TXID, () =>
      Promise.resolve(null),
    ).catch(() => undefined);
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({});
  });
});
