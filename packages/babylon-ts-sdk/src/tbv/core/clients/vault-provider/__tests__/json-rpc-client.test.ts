import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  JSON_RPC_ERROR_CODES,
  JsonRpcClient,
  JsonRpcError,
} from "../json-rpc-client";
import { RpcErrorCode } from "../types";

const TEST_TIMEOUT_MS = 5000;
const TEST_BASE_URL = "https://vp.example.com/rpc";

const HTTP_OK = 200;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;

function createSuccessResponse(result: unknown, id: number = 1) {
  return {
    ok: true,
    status: HTTP_OK,
    statusText: "OK",
    json: () => Promise.resolve({ jsonrpc: "2.0", result, id }),
  } as unknown as Response;
}

function createHttpErrorResponse(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

function createJsonRpcErrorResponse(
  code: number,
  message: string,
  id: number = 1,
) {
  return {
    ok: true,
    status: HTTP_OK,
    statusText: "OK",
    json: () =>
      Promise.resolve({ jsonrpc: "2.0", error: { code, message }, id }),
  } as unknown as Response;
}

describe("JsonRpcClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createClient(overrides?: Record<string, unknown>) {
    return new JsonRpcClient({
      baseUrl: TEST_BASE_URL,
      timeout: TEST_TIMEOUT_MS,
      ...overrides,
    });
  }

  it("sends a valid JSON-RPC 2.0 request and returns the result", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createSuccessResponse({ status: "Activated" }));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const result = await client.call("vaultProvider_getPeginStatus", {
      pegin_txid: "abc",
    });

    expect(result).toEqual({ status: "Activated" });
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(TEST_BASE_URL);
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("vaultProvider_getPeginStatus");
    // jsonrpsee expects params wrapped in an array
    expect(body.params).toEqual([{ pegin_txid: "abc" }]);
    expect(body.id).toBe(1);
  });

  it("strips trailing slash from base URL", () => {
    const client = createClient({ baseUrl: `${TEST_BASE_URL}/` });
    expect(client.getBaseUrl()).toBe(TEST_BASE_URL);
  });

  it("throws JsonRpcError on JSON-RPC error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          createJsonRpcErrorResponse(RpcErrorCode.NOT_FOUND, "PegIn not found"),
        ),
    );

    const client = createClient();
    await expect(
      client.call("vaultProvider_getPeginStatus", { pegin_txid: "abc" }),
    ).rejects.toThrow(JsonRpcError);

    try {
      await client.call("vaultProvider_getPeginStatus", { pegin_txid: "abc" });
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(RpcErrorCode.NOT_FOUND);
      expect((err as JsonRpcError).message).toBe("PegIn not found");
    }
  });

  it("retries getPeginStatus on retryable HTTP status codes", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createHttpErrorResponse(
          HTTP_SERVICE_UNAVAILABLE,
          "Service Unavailable",
        ),
      )
      .mockResolvedValueOnce(createSuccessResponse({ status: "Activated" }));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient({ retryDelay: 100 });
    const resultPromise = client.call("vaultProvider_getPeginStatus", {
      pegin_txid: "abc",
    });

    // Advance past the retry delay (100ms * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result).toEqual({ status: "Activated" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry write methods like submitDepositorWotsKey", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        createHttpErrorResponse(
          HTTP_SERVICE_UNAVAILABLE,
          "Service Unavailable",
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    await expect(
      client.call("vaultProvider_submitDepositorWotsKey", {
        pegin_txid: "abc",
        depositor_pk: "def",
        wots_public_keys: [],
      }),
    ).rejects.toThrow(`HTTP error: ${HTTP_SERVICE_UNAVAILABLE}`);

    // Only one attempt, no retries
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("retries requestDepositorPresignTransactions (idempotent read)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createHttpErrorResponse(
          HTTP_INTERNAL_SERVER_ERROR,
          "Internal Server Error",
        ),
      )
      .mockResolvedValueOnce(createSuccessResponse({ txs: [] }));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient({ retryDelay: 100 });
    const resultPromise = client.call(
      "vaultProvider_requestDepositorPresignTransactions",
      { pegin_txid: "abc", depositor_pk: "def" },
    );

    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result).toEqual({ txs: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("allows custom retryableFor predicate", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createHttpErrorResponse(HTTP_INTERNAL_SERVER_ERROR, "Error"),
      )
      .mockResolvedValueOnce(createSuccessResponse("ok"));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient({
      retryableFor: (method: string) => method.includes("submit"),
      retryDelay: 10,
    });

    const resultPromise = client.call("vaultProvider_submitDepositorWotsKey", {
      pegin_txid: "abc",
      depositor_pk: "def",
      wots_public_keys: [],
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;

    expect(result).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on caller abort signal", async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation(() => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    await expect(
      client.call(
        "vaultProvider_getPeginStatus",
        { pegin_txid: "abc" },
        controller.signal,
      ),
    ).rejects.toThrow("Request aborted");
  });

  it("includes custom headers in requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse("ok"));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient({
      headers: { Authorization: "Bearer token123" },
    });

    await client.call("vaultProvider_getPeginStatus", { pegin_txid: "abc" });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token123",
    });
  });

  it("throws INVALID_RESPONSE when result field is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: HTTP_OK,
        statusText: "OK",
        json: () => Promise.resolve({ jsonrpc: "2.0", id: 1 }),
      } as unknown as Response),
    );

    const client = createClient();
    await expect(
      client.call("vaultProvider_getPeginStatus", { pegin_txid: "abc" }),
    ).rejects.toThrow('missing "result" field');
  });

  it("callRaw returns the raw Response object", async () => {
    const rawResponse = createSuccessResponse({ status: "Activated" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawResponse));

    const client = createClient();
    const response = await client.callRaw("vaultProvider_getPeginStatus", {
      pegin_txid: "abc",
    });

    expect(response).toBe(rawResponse);
  });

  it("throws timeout error after max retries on AbortError for retryable methods", async () => {
    const abortError = new DOMException("signal timed out", "AbortError");
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient({ retries: 1, retryDelay: 10 });

    const resultPromise = client
      .call("vaultProvider_getPeginStatus", { pegin_txid: "abc" })
      .catch((e: Error) => e);

    await vi.advanceTimersByTimeAsync(1000);
    const error = await resultPromise;

    expect(error).toBeInstanceOf(JsonRpcError);
    expect((error as JsonRpcError).code).toBe(JSON_RPC_ERROR_CODES.TIMEOUT);
  });

  it("throws network error on TypeError for non-retryable methods", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const client = createClient();

    try {
      await client.call("vaultProvider_submitDepositorWotsKey", {
        pegin_txid: "abc",
        depositor_pk: "def",
        wots_public_keys: [],
      });
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(JSON_RPC_ERROR_CODES.NETWORK);
    }
  });

  it("increments request ID per call", async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        return Promise.resolve(createSuccessResponse("ok", body.id));
      });
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    await client.call("method1", {});
    await client.call("method2", {});

    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body1.id).toBe(1);
    expect(body2.id).toBe(2);
  });

  // -----------------------------------------------------------------
  // Error source tagging — the server uses code -32001 for auth
  // middleware failures, and the SDK uses it for local network errors.
  // The `source` field ("wire" vs "local") disambiguates.
  // -----------------------------------------------------------------

  it('tags wire-origin JSON-RPC error responses with source="wire" and preserves data', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: HTTP_OK,
        statusText: "OK",
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "token expired",
              data: { kind: "auth_expired", expiresAt: 123 },
            },
            id: 1,
          }),
      } as unknown as Response),
    );

    const client = createClient();
    try {
      await client.call("vaultProvider_submitDepositorWotsKey", {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).source).toBe("wire");
      expect((err as JsonRpcError).code).toBe(-32001);
      expect((err as JsonRpcError).data).toEqual({
        kind: "auth_expired",
        expiresAt: 123,
      });
    }
  });

  it('tags local network errors with source="local"', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const client = createClient({ retries: 0 });
    try {
      await client.call("vaultProvider_submitDepositorWotsKey", {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).source).toBe("local");
      expect((err as JsonRpcError).code).toBe(JSON_RPC_ERROR_CODES.NETWORK);
    }
  });

  // -----------------------------------------------------------------
  // Bearer-token injection via tokenProvider
  // -----------------------------------------------------------------

  it("injects Authorization: Bearer when tokenProvider returns a non-null token", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse("ok"));
    vi.stubGlobal("fetch", mockFetch);

    const tokenProvider = {
      getToken: vi.fn().mockResolvedValue("test-bearer-token"),
      invalidate: vi.fn(),
    };

    const client = createClient({ tokenProvider });
    await client.call("vaultProvider_submitDepositorWotsKey", {});

    expect(tokenProvider.getToken).toHaveBeenCalledWith(
      "vaultProvider_submitDepositorWotsKey",
    );

    const headers = mockFetch.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer test-bearer-token");
  });

  it("omits Authorization header when tokenProvider returns null", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse("ok"));
    vi.stubGlobal("fetch", mockFetch);

    const tokenProvider = {
      getToken: vi.fn().mockResolvedValue(null),
      invalidate: vi.fn(),
    };

    const client = createClient({ tokenProvider });
    await client.call("vaultProvider_getPeginStatus", {});

    const headers = mockFetch.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // Reactive refresh on auth_expired wire error
  // -----------------------------------------------------------------

  it("invalidates token and retries once on wire error with data.kind=auth_expired", async () => {
    const expiredResponse = {
      ok: true,
      status: HTTP_OK,
      statusText: "OK",
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "token expired",
            data: { kind: "auth_expired" },
          },
          id: 1,
        }),
    } as unknown as Response;

    const successResponse = createSuccessResponse("ok", 2);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(expiredResponse)
      .mockResolvedValueOnce(successResponse);
    vi.stubGlobal("fetch", mockFetch);

    let tokenCount = 0;
    const tokenProvider = {
      getToken: vi.fn().mockImplementation(async () => {
        tokenCount++;
        return `token-${tokenCount}`;
      }),
      invalidate: vi.fn(),
    };

    const client = createClient({ tokenProvider });
    const result = await client.call(
      "vaultProvider_submitDepositorWotsKey",
      {},
    );

    expect(result).toBe("ok");
    expect(tokenProvider.invalidate).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(tokenProvider.getToken).toHaveBeenCalledTimes(2);

    const firstAuth = (
      mockFetch.mock.calls[0][1].headers as Record<string, string>
    ).Authorization;
    const secondAuth = (
      mockFetch.mock.calls[1][1].headers as Record<string, string>
    ).Authorization;
    expect(firstAuth).toBe("Bearer token-1");
    expect(secondAuth).toBe("Bearer token-2");
  });

  it("does NOT retry on wire error with code -32001 but no auth_expired data", async () => {
    // Covers the "server sent -32001 for a non-auth reason" path. The
    // SDK must not blindly retry just because the code is -32001 —
    // the `data.kind` marker is required.
    const response = {
      ok: true,
      status: HTTP_OK,
      statusText: "OK",
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "provider not found",
          },
          id: 1,
        }),
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", mockFetch);

    const tokenProvider = {
      getToken: vi.fn().mockResolvedValue("tok"),
      invalidate: vi.fn(),
    };

    const client = createClient({ tokenProvider });
    await expect(
      client.call("vaultProvider_submitDepositorWotsKey", {}),
    ).rejects.toThrow(JsonRpcError);

    expect(tokenProvider.invalidate).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("does NOT retry on local network error even when code is -32001", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const tokenProvider = {
      getToken: vi.fn().mockResolvedValue("tok"),
      invalidate: vi.fn(),
    };

    const client = createClient({ retries: 0, tokenProvider });
    try {
      await client.call("vaultProvider_submitDepositorWotsKey", {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(JSON_RPC_ERROR_CODES.NETWORK);
      expect((err as JsonRpcError).source).toBe("local");
    }
    expect(tokenProvider.invalidate).not.toHaveBeenCalled();
  });

  it("callRaw injects Authorization but does NOT reactively refresh", async () => {
    const expiredRaw = new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "token expired",
          data: { kind: "auth_expired" },
        },
        id: 1,
      }),
      { status: HTTP_OK, headers: { "Content-Type": "application/json" } },
    );

    const mockFetch = vi.fn().mockResolvedValue(expiredRaw);
    vi.stubGlobal("fetch", mockFetch);

    const tokenProvider = {
      getToken: vi.fn().mockResolvedValue("tok"),
      invalidate: vi.fn(),
    };

    const client = createClient({ tokenProvider });
    const raw = await client.callRaw(
      "vaultProvider_requestDepositorClaimerArtifacts",
      {},
    );

    // callRaw succeeds regardless of body content — it does not inspect
    // the body, so there's no reactive refresh.
    expect(raw).toBeInstanceOf(Response);
    expect(tokenProvider.invalidate).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledOnce();

    const headers = mockFetch.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer tok");
  });
});
