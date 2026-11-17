import {
  isAuthRejectedError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  ArtifactsNotReadyError,
  downloadRecoveryKitSession,
  fetchRecoveryKitManifest,
} from "../httpArtifactDownload";

const BASE = "https://proxy.example.com/artifacts/0xVP";
const TXID = "ab".repeat(32);
const KEY_A = "11".repeat(32);
const KEY_B = "22".repeat(32);
const SESSION_A = new Uint8Array(32 * 1024).fill(1);
const SESSION_B = new Uint8Array(32 * 1024 + 1).fill(2);
const SMALL_SESSION = new Uint8Array(32 * 1024 - 1);
const TOKEN = "jsonrpc.bearer";
const RESUME_AT = 1024;

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

/** A fetch mock: typed as `fetch` for the code, untyped for assertions. */
const asFetch = <M extends ReturnType<typeof vi.fn>>(mock: M) =>
  mock as M & typeof fetch;

function fetchReturning(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  return asFetch(fetchMock);
}

/** A fetch that never answers and rejects with the abort reason. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const fetchMock = asFetch(
    vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          signals.push(init.signal);
          init.signal.addEventListener("abort", () =>
            reject(init.signal.reason),
          );
        }),
    ),
  );
  return { fetchMock, signals };
}

const getToken = () => Promise.resolve(TOKEN);
const sessionA = {
  key: KEY_A,
  url: `${BASE}/${TXID}/sessions/${KEY_A}`,
  byteLength: SESSION_A.byteLength,
};

const parse = (body: unknown, status = 200) =>
  fetchRecoveryKitManifest(
    BASE,
    TXID,
    getToken,
    undefined,
    fetchReturning(jsonResponse(body, status)),
  );

const manifestError = (fetchMock: typeof fetch) =>
  fetchRecoveryKitManifest(BASE, TXID, getToken, undefined, fetchMock).catch(
    (e: unknown) => e,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchRecoveryKitManifest", () => {
  it("requests the deposit's manifest URL with the bearer and no redirects", async () => {
    const fetchMock = fetchReturning(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
    );
    await fetchRecoveryKitManifest(BASE, TXID, getToken, undefined, fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/${TXID}/manifest`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
  });

  it("lowercases the txid in the manifest URL", async () => {
    const fetchMock = fetchReturning(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
    );
    await fetchRecoveryKitManifest(
      BASE,
      TXID.toUpperCase(),
      getToken,
      undefined,
      fetchMock,
    );
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/${TXID}/manifest`);
  });

  it("parses the graph and orders sessions by key", async () => {
    const m = await parse(manifest({ [KEY_B]: SESSION_B, [KEY_A]: SESSION_A }));
    expect([...m.sessions.keys()]).toEqual([KEY_A, KEY_B]);
    expect(m.txGraph).toEqual({ graph: true });
    expect(m.txGraphJson).toBe('{"graph":true}');
    expect(m.verifyingKeyHex).toBe("abcd");
    expect(m.sessions.get(KEY_A)).toEqual({
      key: KEY_A,
      url: `${BASE}/${TXID}/sessions/${KEY_A}`,
      byteLength: SESSION_A.byteLength,
    });
  });

  it.each([
    [
      "an empty graph",
      { ...manifest({ [KEY_A]: SESSION_A }), tx_graph_json: "" },
    ],
    [
      "a graph that is an array",
      { ...manifest({ [KEY_A]: SESSION_A }), tx_graph_json: "[]" },
    ],
    [
      "a graph over 32 MiB",
      {
        ...manifest({ [KEY_A]: SESSION_A }),
        tx_graph_json: `{"a":"${"x".repeat(32 * 1024 * 1024)}"}`,
      },
    ],
    [
      "an empty verifying key",
      { ...manifest({ [KEY_A]: SESSION_A }), verifying_key_hex: "" },
    ],
    [
      "an odd-length verifying key",
      { ...manifest({ [KEY_A]: SESSION_A }), verifying_key_hex: "abc" },
    ],
    [
      "an upper-case verifying key",
      { ...manifest({ [KEY_A]: SESSION_A }), verifying_key_hex: "ABCD" },
    ],
    [
      "a verifying key over 64 KiB",
      {
        ...manifest({ [KEY_A]: SESSION_A }),
        verifying_key_hex: "ab".repeat(32 * 1024 + 1),
      },
    ],
    ["no sessions", manifest({})],
    ["a session under 32 KiB", manifest({ [KEY_A]: SMALL_SESSION })],
  ])("rejects a manifest with %s", async (_, body) => {
    await expect(parse(body)).rejects.toBeInstanceOf(VpResponseValidationError);
  });

  it("accepts a session of exactly 32 KiB and a verifying key of exactly 64 KiB", async () => {
    const m = await parse({
      ...manifest({ [KEY_A]: SESSION_A }),
      verifying_key_hex: "ab".repeat(32 * 1024),
    });
    expect(m.sessions.get(KEY_A)!.byteLength).toBe(32 * 1024);
  });

  it("rejects more than 1024 sessions", async () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 1025; i++)
      many[i.toString(16).padStart(64, "0")] = SESSION_A;
    await expect(parse(manifest(many))).rejects.toBeInstanceOf(
      VpResponseValidationError,
    );
  });

  it("rejects a body longer than its declared Content-Length before parsing", async () => {
    const text = JSON.stringify(manifest({ [KEY_A]: SESSION_A }));
    const response = new Response(text + " ".repeat(10), {
      status: 200,
      headers: { "content-length": String(text.length) },
    });
    await expect(
      fetchRecoveryKitManifest(
        BASE,
        TXID,
        getToken,
        undefined,
        fetchReturning(response),
      ),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
  });

  it.each([
    ["an upper-case challenger key", "AB".repeat(32)],
    ["a non-hex challenger key", "zz".repeat(32)],
    ["a short challenger key", "11".repeat(31)],
  ])("rejects a manifest with %s", async (_, key) => {
    // The download path matches the key, so only the key check can refuse it.
    await expect(parse(manifest({ [key]: SESSION_A }))).rejects.toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects a manifest that points a session at another path", async () => {
    const bad = manifest({ [KEY_A]: SESSION_A });
    bad.babe_sessions[KEY_A]!.download_path = "/v1/other";
    await expect(parse(bad)).rejects.toThrow(VpResponseValidationError);
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
    await expect(
      fetchRecoveryKitManifest(
        BASE,
        TXID,
        getToken,
        undefined,
        fetchReturning(new Response("{}", { status: 200, headers })),
      ),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it.each([0, -1, 32768.5, 256 * 1024 * 1024 + 1])(
    "rejects a manifest byte_length of %s",
    async (byteLength) => {
      const bad = manifest({ [KEY_A]: SESSION_A });
      bad.babe_sessions[KEY_A]!.byte_length = byteLength;
      await expect(parse(bad)).rejects.toThrow(VpResponseValidationError);
    },
  );

  it("maps 401 to an auth rejection so the caller re-primes", async () => {
    const err = await manifestError(
      fetchReturning(jsonResponse({ error_name: "UNAUTHENTICATED" }, 401)),
    );
    expect(isAuthRejectedError(err)).toBe(true);
  });

  it.each([
    { name: "INVALID_STATE", invalidState: true },
    { name: "ARTIFACTS_NOT_READY", invalidState: false },
  ])("maps 409 $name to ArtifactsNotReadyError", async (c) => {
    const err = await manifestError(
      fetchReturning(jsonResponse({ error_name: c.name }, 409)),
    );
    expect(err).toBeInstanceOf(ArtifactsNotReadyError);
    expect((err as ArtifactsNotReadyError).invalidState).toBe(c.invalidState);
  });

  it("treats a 409 with another name as a plain failure", async () => {
    const err = await manifestError(
      fetchReturning(jsonResponse({ error_name: "SOMETHING_ELSE" }, 409)),
    );
    expect(err).not.toBeInstanceOf(ArtifactsNotReadyError);
    expect(err).toEqual(
      new Error(
        COPY.deposit.recoveryArtifacts.downloadFailedHttp(
          409,
          "SOMETHING_ELSE",
        ),
      ),
    );
  });

  it("fails once, without retrying, when the VP serves no artifact routes", async () => {
    const fetchMock = fetchReturning(new Response(null, { status: 404 }));
    const err = await manifestError(fetchMock);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ArtifactsNotReadyError);
    expect(isAuthRejectedError(err)).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends no Authorization header when no token is cached", async () => {
    const fetchMock = fetchReturning(jsonResponse({}, 401));
    await fetchRecoveryKitManifest(
      BASE,
      TXID,
      () => Promise.resolve(null),
      undefined,
      fetchMock,
    ).catch(() => undefined);
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({});
  });

  it.each([429, 502, 503])(
    "waits the full Retry-After above 30 seconds for a %i response",
    async (status) => {
      vi.useFakeTimers();
      const fetchMock = fetchReturning(
        new Response(null, { status, headers: { "retry-after": "60" } }),
        jsonResponse(manifest({ [KEY_A]: SESSION_A })),
      );

      const pending = fetchRecoveryKitManifest(
        BASE,
        TXID,
        getToken,
        undefined,
        fetchMock,
      );
      await vi.advanceTimersByTimeAsync(59_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const m = await pending;

      expect([...m.sessions.keys()]).toEqual([KEY_A]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("stops immediately when Retry-After exceeds the remaining busy wait budget", async () => {
    vi.useFakeTimers();
    const response = jsonResponse({ error_name: "BUSY" }, 503);
    response.headers.set("retry-after", "61");
    const fetchMock = fetchReturning(
      new Response(null, { status: 503, headers: { "retry-after": "240" } }),
      response,
    );
    const pending = manifestError(fetchMock);
    await vi.advanceTimersByTimeAsync(240_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(await pending).toEqual(
      new Error(COPY.deposit.recoveryArtifacts.downloadFailedHttp(503, "BUSY")),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels a busy wait without another fetch", async () => {
    vi.useFakeTimers();
    const fetchMock = fetchReturning(
      new Response(null, { status: 503, headers: { "retry-after": "60" } }),
    );
    const controller = new AbortController();
    const pending = fetchRecoveryKitManifest(
      BASE,
      TXID,
      getToken,
      controller.signal,
      fetchMock,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort();
    expect(await pending).toBe(controller.signal.reason);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      status: 429,
      message: COPY.deposit.recoveryArtifacts.downloadLimitReached,
    },
    {
      status: 503,
      message: COPY.deposit.recoveryArtifacts.downloadFailedHttp(
        503,
        "DOWNLOAD_QUOTA_EXHAUSTED",
      ),
    },
  ])(
    "maps HTTP $status DOWNLOAD_QUOTA_EXHAUSTED to the expected message",
    async ({ status, message }) => {
      const response = jsonResponse(
        { error_name: "DOWNLOAD_QUOTA_EXHAUSTED" },
        status,
      );
      response.headers.set("retry-after", "301");
      const fetchMock = fetchReturning(response);

      await expect(manifestError(fetchMock)).resolves.toEqual(
        new Error(message),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("retries the manifest after a network error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(manifest({ [KEY_A]: SESSION_A })),
    );
    const pending = fetchRecoveryKitManifest(
      BASE,
      TXID,
      getToken,
      undefined,
      fetchMock,
    );
    await vi.runAllTimersAsync();
    expect([...(await pending).sessions.keys()]).toEqual([KEY_A]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("downloadRecoveryKitSession", () => {
  it("returns ArrayBuffer-backed chunks and the verified digest, reporting bytes as they arrive", async () => {
    const seen: number[] = [];
    const fetchMock = fetchReturning(sessionResponse(SESSION_A));
    const { chunks, sha256: digest } = await downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
      (n) => seen.push(n),
    );
    expect(Buffer.concat(chunks.map((c) => Buffer.from(c)))).toEqual(
      Buffer.from(SESSION_A),
    );
    // Realm-independent: a SharedArrayBuffer tags differently.
    expect(
      chunks.every(
        (c) =>
          Object.prototype.toString.call(c.buffer) === "[object ArrayBuffer]",
      ),
    ).toBe(true);
    expect(`"${digest}"`).toBe(etagOf(SESSION_A));
    expect(seen.at(-1)).toBe(SESSION_A.byteLength);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(fetchMock.mock.calls[0][0]).toBe(sessionA.url);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
  });

  it("resumes a broken session with Range and If-Range", async () => {
    const rest = SESSION_A.slice(RESUME_AT);
    const fetchMock = fetchReturning(
      brokenSessionResponse(SESSION_A, RESUME_AT),
      new Response(rest, {
        status: 206,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(rest.byteLength),
          "content-range": `bytes ${RESUME_AT}-32767/32768`,
        },
      }),
    );

    const { chunks } = await downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    );

    expect(Buffer.concat(chunks.map((c) => Buffer.from(c)))).toEqual(
      Buffer.from(SESSION_A),
    );
    expect(fetchMock.mock.calls[1]![1].headers).toMatchObject({
      Range: `bytes=${RESUME_AT}-`,
      "If-Range": etagOf(SESSION_A),
    });
  });

  it("restarts the byte report when a 200 replaces a partial transfer", async () => {
    const seen: number[] = [];
    const fetchMock = fetchReturning(
      brokenSessionResponse(SESSION_A, RESUME_AT),
      sessionResponse(SESSION_A),
    );
    const { chunks } = await downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
      (n) => seen.push(n),
    );
    // The partial count drops back to zero before the full body arrives.
    const resumeAt = seen.indexOf(RESUME_AT);
    expect(resumeAt).toBeGreaterThanOrEqual(0);
    expect(seen[resumeAt + 1]).toBe(0);
    expect(seen.at(-1)).toBe(SESSION_A.byteLength);
    expect(Buffer.concat(chunks.map((c) => Buffer.from(c)))).toEqual(
      Buffer.from(SESSION_A),
    );
  });

  it("maps a resume answered without an ETag to the download-failed copy", async () => {
    const fetchMock = fetchReturning(
      brokenSessionResponse(SESSION_A, RESUME_AT),
      new Response(null, { status: 416 }),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(
      COPY.deposit.recoveryArtifacts.downloadFailedHttp(416, ""),
    );
  });

  it("rejects session bytes that do not match the ETag", async () => {
    const fetchMock = fetchReturning(
      new Response(SESSION_A, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_B),
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a session 200 without a SHA-256 ETag", async () => {
    const fetchMock = fetchReturning(
      new Response(SESSION_A, {
        status: 200,
        headers: {
          etag: 'W/"weak"',
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a session body longer than the manifest length", async () => {
    const longer = new Uint8Array([...SESSION_A, 9]);
    const fetchMock = fetchReturning(
      new Response(longer, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it("rejects a session Content-Length that does not match the manifest", async () => {
    const fetchMock = fetchReturning(
      new Response(SESSION_A, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength + 1),
        },
      }),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(VpResponseValidationError);
  });

  // Content-Length always matches the range, so only the named check can
  // refuse the response, never the length check that follows it.
  it.each([
    {
      label: "a changed ETag",
      etag: etagOf(SESSION_B),
      range: `bytes ${RESUME_AT}-32767/32768`,
      contentLength: 32768 - RESUME_AT,
    },
    {
      label: "an end past the session",
      etag: etagOf(SESSION_A),
      range: `bytes ${RESUME_AT}-32768/32768`,
      contentLength: 32769 - RESUME_AT,
    },
    {
      label: "an end before the start",
      etag: etagOf(SESSION_A),
      range: `bytes ${RESUME_AT}-${RESUME_AT - 1}/32768`,
      contentLength: 0,
    },
    {
      label: "a wrong start",
      etag: etagOf(SESSION_A),
      range: `bytes ${RESUME_AT - 1}-32767/32768`,
      contentLength: 32768 - RESUME_AT,
    },
    {
      label: "a total that differs from the manifest",
      etag: etagOf(SESSION_A),
      range: `bytes ${RESUME_AT}-32767/32769`,
      contentLength: 32768 - RESUME_AT,
    },
  ])(
    "rejects a resumed 206 with $label",
    async ({ etag, range, contentLength }) => {
      const rest = SESSION_A.slice(RESUME_AT);
      const fetchMock = fetchReturning(
        brokenSessionResponse(SESSION_A, RESUME_AT),
        new Response(rest, {
          status: 206,
          headers: {
            etag,
            "content-length": String(contentLength),
            "content-range": range,
          },
        }),
      );
      await expect(
        downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
      ).rejects.toThrow(VpResponseValidationError);
    },
  );

  it("rejects a 206 when no bytes were received yet", async () => {
    const fetchMock = fetchReturning(
      new Response(SESSION_A, {
        status: 206,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength),
          "content-range": "bytes 0-32767/32768",
        },
      }),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(VpResponseValidationError);
  });

  it("maps a session 409 ARTIFACTS_NOT_READY to ArtifactsNotReadyError", async () => {
    const fetchMock = fetchReturning(
      jsonResponse({ error_name: "ARTIFACTS_NOT_READY" }, 409),
    );
    await expect(
      downloadRecoveryKitSession(sessionA, getToken, undefined, fetchMock),
    ).rejects.toThrow(ArtifactsNotReadyError);
  });

  it("does not count busy answers against the transfer attempts", async () => {
    const busy = () =>
      new Response(null, { status: 429, headers: { "retry-after": "0.001" } });
    const fetchMock = fetchReturning(
      ...Array.from({ length: 10 }, busy),
      sessionResponse(SESSION_A),
    );
    const { sha256: digest } = await downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    );
    expect(`"${digest}"`).toBe(etagOf(SESSION_A));
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it("reports exhausted transfer attempts with copy, keeping the last transport error", async () => {
    vi.useFakeTimers();
    const lastError = new TypeError("network error");
    const fetchMock = vi.fn().mockRejectedValue(lastError);
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await pending;

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(VpResponseValidationError);
    expect((err as Error).message).toBe(
      COPY.deposit.recoveryArtifacts.transferRetriesExhausted(8),
    );
    expect((err as Error).cause).toBe(lastError);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("ends with a transport error, not a validation error, when every body breaks", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() =>
      Promise.resolve(brokenSessionResponse(SESSION_A, 2)),
    );
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await pending;

    expect(err).not.toBeInstanceOf(VpResponseValidationError);
    expect((err as Error).message).toBe(
      COPY.deposit.recoveryArtifacts.transferRetriesExhausted(8),
    );
  });

  it("reports exhausted manifest attempts with copy, keeping the last transport error", async () => {
    vi.useFakeTimers();
    const lastError = new TypeError("network error");
    const fetchMock = vi.fn().mockRejectedValue(lastError);
    const pending = fetchRecoveryKitManifest(
      BASE,
      TXID,
      getToken,
      undefined,
      fetchMock,
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await pending;

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(VpResponseValidationError);
    expect((err as Error).message).toBe(
      COPY.deposit.recoveryArtifacts.transferRetriesExhausted(8),
    );
    expect((err as Error).cause).toBe(lastError);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("rethrows an abort instead of retrying", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      downloadRecoveryKitSession(
        sessionA,
        getToken,
        controller.signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-progress session download when the caller's signal aborts", async () => {
    const { fetchMock, signals } = hangingFetch();
    const controller = new AbortController();
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      controller.signal,
      fetchMock,
    );
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.abort();

    await expect(pending).rejects.toBe(controller.signal.reason);
    expect(signals[0]!.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a session download when the caller's signal aborts on a browser without AbortSignal.any", async () => {
    const original = AbortSignal.any;
    // @ts-expect-error - deliberately emulating a browser that predates the API
    delete AbortSignal.any;
    try {
      const { fetchMock, signals } = hangingFetch();
      const controller = new AbortController();
      const pending = downloadRecoveryKitSession(
        sessionA,
        getToken,
        controller.signal,
        fetchMock,
      );
      await vi.waitFor(() => expect(signals).toHaveLength(1));
      controller.abort();

      await expect(pending).rejects.toBe(controller.signal.reason);
      expect(signals[0]!.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      AbortSignal.any = original;
    }
  });

  it("retries a request whose headers never arrive", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      )
      .mockResolvedValueOnce(sessionResponse(SESSION_A));
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    );
    await vi.advanceTimersByTimeAsync(120_000); // the header bound
    await vi.runAllTimersAsync(); // the backoff before attempt 2
    const { sha256: digest } = await pending;

    expect(`"${digest}"`).toBe(etagOf(SESSION_A));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("retries a request whose fetch never settles, even ignoring the abort", async () => {
    vi.useFakeTimers();
    const fetchMock = asFetch(
      vi
        .fn()
        .mockImplementationOnce(() => new Promise<Response>(() => {}))
        .mockResolvedValueOnce(sessionResponse(SESSION_A)),
    );
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    );
    await vi.advanceTimersByTimeAsync(120_000); // the header bound
    await vi.runAllTimersAsync(); // the backoff before attempt 2
    const { sha256: digest } = await pending;

    expect(`"${digest}"`).toBe(etagOf(SESSION_A));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a body that streams for longer than the header bound", async () => {
    vi.useFakeTimers();
    const CHUNK_DELAY_MS = 50_000;
    const QUARTER = SESSION_A.byteLength / 4;
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
        if (sent >= SESSION_A.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(SESSION_A.slice(sent, sent + QUARTER));
        sent += QUARTER;
      },
    });
    const fetchMock = fetchReturning(
      new Response(body, {
        status: 200,
        headers: {
          etag: etagOf(SESSION_A),
          "content-length": String(SESSION_A.byteLength),
        },
      }),
    );
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    );
    await vi.runAllTimersAsync(); // 5 × 50 s, well past the 120 s bound
    const { sha256: digest } = await pending;

    expect(`"${digest}"`).toBe(etagOf(SESSION_A));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
  });

  it("does not fire the header bound before 120 seconds", async () => {
    vi.useFakeTimers();
    const { fetchMock, signals } = hangingFetch();
    void downloadRecoveryKitSession(
      sessionA,
      getToken,
      undefined,
      fetchMock,
    ).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(signals[0]!.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]!.aborted).toBe(true);
  });

  it("treats a caller abort during the header wait as a cancellation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { fetchMock } = hangingFetch();
    const pending = downloadRecoveryKitSession(
      sessionA,
      getToken,
      controller.signal,
      fetchMock,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await expect(pending).rejects.toBe(controller.signal.reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
