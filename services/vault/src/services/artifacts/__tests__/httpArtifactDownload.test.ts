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
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(text).byteLength),
    },
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

  it.each([
    { name: "INVALID_STATE", invalidState: true },
    { name: "ARTIFACTS_NOT_READY", invalidState: false },
  ])("maps 409 $name to ArtifactsNotReadyError", async (c) => {
    mockFetch(jsonResponse({ error_name: c.name }, 409));

    const err = await fetchHttpArtifactsResponse(BASE, TXID, getToken).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ArtifactsNotReadyError);
    expect((err as ArtifactsNotReadyError).invalidState).toBe(c.invalidState);
  });

  it("maps a session 409 ARTIFACTS_NOT_READY to ArtifactsNotReadyError", async () => {
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      jsonResponse({ error_name: "ARTIFACTS_NOT_READY" }, 409),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(ArtifactsNotReadyError);
  });

  it("treats a 409 with another name as a plain failure", async () => {
    mockFetch(jsonResponse({ error_name: "SOMETHING_ELSE" }, 409));

    const err = await fetchHttpArtifactsResponse(BASE, TXID, getToken).catch(
      (e: unknown) => e,
    );
    expect(err).not.toBeInstanceOf(ArtifactsNotReadyError);
    expect(String(err)).toContain("HTTP 409 SOMETHING_ELSE");
  });

  it("sends no Authorization header when no token is cached", async () => {
    const fetchMock = mockFetch(jsonResponse({}, 401));

    await fetchHttpArtifactsResponse(BASE, TXID, () =>
      Promise.resolve(null),
    ).catch(() => undefined);
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({});
  });

  it.each([429, 502, 503])(
    "retries a %i response after Retry-After",
    async (status) => {
      const fetchMock = mockFetch(
        new Response(null, { status, headers: { "retry-after": "0.001" } }),
        jsonResponse(manifest({ [KEY_A]: SESSION_A })),
        sessionResponse(SESSION_A),
      );

      const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
      const result = JSON.parse(await response.text()).result;

      expect(result.babe_sessions[KEY_A].decryptor_artifacts_hex).toBe(
        bytesToHex(SESSION_A),
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it("does not count busy answers against the transfer attempts", async () => {
    const busy = () =>
      new Response(null, { status: 429, headers: { "retry-after": "0.001" } });
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      ...Array.from({ length: 10 }, busy),
      sessionResponse(SESSION_A),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    const result = JSON.parse(await response.text()).result;
    expect(result.babe_sessions[KEY_A].decryptor_artifacts_hex).toBe(
      bytesToHex(SESSION_A),
    );
  });

  it("ends with a transport error, not a validation error, after the attempts", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() =>
        Promise.resolve(brokenSessionResponse(SESSION_A, 2)),
      );
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(manifest({ [KEY_A]: SESSION_A }))),
      );
      // Each resume after the first break is a 206 of the next bytes that
      // breaks again before the end.
      vi.stubGlobal("fetch", fetchMock);

      const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
      const text = response.text().catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const err = await text;

      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(VpResponseValidationError);
      expect(String(err)).toContain("failed after 8 attempts");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { label: "no Content-Length", length: null },
    {
      label: "a Content-Length over 64 MiB",
      length: String(64 * 1024 * 1024 + 1),
    },
  ])("rejects a manifest with $label", async ({ length }) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (length !== null) headers["content-length"] = length;
    mockFetch(new Response("{}", { status: 200, headers }));

    await expect(
      fetchHttpArtifactsResponse(BASE, TXID, getToken),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it.each([0, -1, 1.5, 256 * 1024 * 1024 + 1])(
    "rejects a manifest byte_length of %s",
    async (byteLength) => {
      const bad = manifest({ [KEY_A]: SESSION_A });
      bad.babe_sessions[KEY_A]!.byte_length = byteLength;
      mockFetch(jsonResponse(bad));

      await expect(
        fetchHttpArtifactsResponse(BASE, TXID, getToken),
      ).rejects.toThrow(VpResponseValidationError);
    },
  );

  it("rejects a session 200 without a SHA-256 ETag", async () => {
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      new Response(SESSION_A, {
        status: 200,
        headers: {
          etag: 'W/"weak"',
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a session body longer than the manifest length", async () => {
    const longer = new Uint8Array([...SESSION_A, 9]);
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      new Response(longer, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a session Content-Length that does not match the manifest", async () => {
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      new Response(SESSION_A, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength + 1),
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(VpResponseValidationError);
  });

  it.each([
    { label: "a changed ETag", etag: etagOf(SESSION_B), range: "bytes 4-5/6" },
    {
      label: "an end past the session",
      etag: etagOf(SESSION_A),
      range: "bytes 4-6/6",
    },
    {
      label: "an end before the start",
      etag: etagOf(SESSION_A),
      range: "bytes 4-3/6",
    },
    { label: "a wrong start", etag: etagOf(SESSION_A), range: "bytes 3-5/6" },
  ])("rejects a resumed 206 with $label", async ({ etag, range }) => {
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      brokenSessionResponse(SESSION_A, 4),
      new Response(SESSION_A.slice(4), {
        status: 206,
        headers: {
          etag,
          "content-length": "2",
          "content-range": range,
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a 206 when no bytes were received yet", async () => {
    mockFetch(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      new Response(SESSION_A, {
        status: 206,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength),
          "content-range": "bytes 0-5/6",
        },
      }),
    );

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    await expect(response.text()).rejects.toThrow(VpResponseValidationError);
  });

  it("retries the manifest after a network error", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));
    fetchMock.mockResolvedValueOnce(jsonResponse(manifest({})));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const pending = fetchHttpArtifactsResponse(BASE, TXID, getToken);
      await vi.runAllTimersAsync();
      const result = JSON.parse(await (await pending).text()).result;
      expect(result.babe_sessions).toEqual({});
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts an in-progress session download when the body is cancelled", async () => {
    let sessionSignal: AbortSignal | undefined;
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
    );
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) => {
        sessionSignal = init.signal;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(init.signal.reason),
          );
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchHttpArtifactsResponse(BASE, TXID, getToken);
    const reader = response.body!.getReader();
    await reader.read(); // the head
    const pending = reader.read(); // starts the session download
    await vi.waitFor(() => expect(sessionSignal).toBeDefined());
    await reader.cancel();
    await pending.catch(() => undefined);

    expect(sessionSignal!.aborted).toBe(true);
  });
});
