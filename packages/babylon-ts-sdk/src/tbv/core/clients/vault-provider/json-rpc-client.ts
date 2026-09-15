/**
 * Generic JSON-RPC 2.0 HTTP Client
 *
 * Framework-agnostic client using `fetch()` — works in browsers and Node.js 18+.
 * Includes configurable retry policy and AbortSignal passthrough.
 */

export interface JsonRpcRequest<T = unknown> {
  jsonrpc: "2.0";
  method: string;
  params: T;
  id: number | string;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: "2.0";
  result: T;
  id: number | string;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number | string;
}

export type JsonRpcResponse<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse;

/**
 * Injects bearer tokens into requests for auth-gated methods, and is
 * notified when the server rejects a bearer so it can invalidate its cache.
 *
 * The `JsonRpcClient` is agnostic to which methods are auth-gated —
 * the provider's `getToken(method)` decides. Returning `null` means
 * "no auth required for this method"; the client then sends the
 * request with no `Authorization` header.
 */
export interface BearerTokenProvider {
  /**
   * Return the bearer token to inject for `method`, or `null` if the
   * method does not require auth.
   */
  getToken(method: string): Promise<string | null>;
  /**
   * Drop the cached token. Next call to `getToken` must re-acquire.
   * Called by the client on reactive-refresh-trigger responses.
   */
  invalidate(): void;
}

export interface JsonRpcClientConfig {
  /** Base URL of the RPC service */
  baseUrl: string;
  /** Timeout in milliseconds per request attempt */
  timeout: number;
  /** Optional custom headers */
  headers?: Record<string, string>;
  /** Number of retry attempts for transient errors (default: 3) */
  retries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
  /**
   * Maximum response body size, in bytes, for typed JSON-RPC calls.
   * `callRaw` intentionally returns the unparsed Response and is not capped here.
   * Default: 2 MiB.
   */
  maxResponseBytes?: number;
  /**
   * Predicate that decides which methods retry on transient errors.
   * Default retries only `getPeginStatusByVaultId`,
   * `batchGetPeginStatusByVaultId`, `batchGetPegoutStatusByVaultId`, and
   * `requestDepositorPresignTransactions`.
   * Write methods are not retried by default.
   */
  retryableFor?: (method: string) => boolean;
  /**
   * Per-request bearer-token source. A non-null return attaches
   * `Authorization: Bearer <token>`; `null` skips auth. `call`
   * additionally retries once when the server rejects the bearer
   * (invalidate + refetch + retry) — see {@link isAuthRejectedError}.
   * `callRaw` skips reactive refresh.
   */
  tokenProvider?: BearerTokenProvider;
}

// "wire" = parsed from a JSON-RPC error envelope; "local" = timeout/network/parse failure.
export type JsonRpcErrorSource = "wire" | "local";

export class JsonRpcError extends Error {
  constructor(
    public code: number,
    message: string,
    /** "wire" for server-returned envelopes; "local" for SDK-side failures. */
    public source: JsonRpcErrorSource = "local",
    /** Structured data from the server `error.data` field, if any. */
    public data?: unknown,
  ) {
    super(message);
    this.name = "JsonRpcError";
  }
}

export const JSON_RPC_ERROR_CODES = {
  TIMEOUT: -32000,
  NETWORK: -32001,
  /** VP proxy: request timed out at proxy level */
  PROXY_TIMEOUT: -32002,
  /** VP proxy: VP unreachable / DNS failure / response too large */
  PROXY_UNAVAILABLE: -32003,
  /** SDK client: response missing "result" field (malformed JSON-RPC) */
  INVALID_RESPONSE: -32700,
  /** SDK client: response body exceeded the configured byte limit */
  RESPONSE_TOO_LARGE: -32701,
} as const;

/** JSON-RPC protocol version */
const JSON_RPC_VERSION = "2.0" as const;

/** Default number of retry attempts for transient errors */
const DEFAULT_RETRY_ATTEMPTS = 3;

/** Default initial retry delay in milliseconds */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Default maximum JSON-RPC response size for typed calls (2 MiB) */
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * TODO: Temporary typed-call exceptions for methods that currently return large
 * artifact payloads as JSON-RPC results.
 */
const UNCAPPED_TYPED_RESPONSE_METHODS: ReadonlySet<string> = new Set([
  "vaultProvider_requestDepositorClaimerArtifacts",
]);

/** HTTP status codes that indicate transient server errors and are safe to retry */
const RETRYABLE_HTTP_STATUS_CODES: ReadonlySet<number> = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/** Default retry predicate: only retry read-only / idempotent methods */
const DEFAULT_RETRYABLE_METHODS: ReadonlySet<string> = new Set([
  "vaultProvider_getPeginStatusByVaultId",
  "vaultProvider_batchGetPeginStatusByVaultId",
  "vaultProvider_batchGetPegoutStatusByVaultId",
  "vaultProvider_requestDepositorPresignTransactions",
]);

function defaultRetryableFor(method: string): boolean {
  return DEFAULT_RETRYABLE_METHODS.has(method);
}

/**
 * JSON-RPC error code the vault provider returns for every bearer-token
 * rejection: expired, not-yet-valid, missing bearer, invalid signature,
 * invalid claims, invalid structure, subject mismatch, issuer mismatch.
 * All eight variants collapse onto this one code, distinguished only by
 * message text — see btc-vault `crates/btc-auth/src/rpc.rs`
 * (`auth_error_to_rpc_error`). Operationally they all mean the same
 * thing: this bearer is dead, mint a new one.
 *
 * Numerically equal to {@link JSON_RPC_ERROR_CODES.NETWORK}, which this
 * client throws for local network failures. `source` is what separates
 * them — see {@link isAuthRejectedError}.
 */
export const AUTH_REJECTED_RPC_CODE = -32001;

/**
 * True when `error` is the vault provider rejecting our bearer token.
 *
 * Classified on the error code, which is the only thing the server
 * guarantees: its auth errors carry `data: null` unconditionally
 * (`rpc_error` passes `None::<()>`), so any predicate keyed on an
 * `error.data` field can never match a real response.
 *
 * `source === "wire"` is load-bearing: this client reuses -32001
 * internally as {@link JSON_RPC_ERROR_CODES.NETWORK}, always with
 * source "local".
 *
 * Known, bounded collision: the vault-provider proxy reuses -32001 for
 * "Provider not found". A call to a deregistered provider therefore
 * costs one wasted token-mint round-trip, which fails against the same
 * registry check and surfaces the same message.
 */
export function isAuthRejectedError(error: unknown): boolean {
  return (
    error instanceof JsonRpcError &&
    error.source === "wire" &&
    error.code === AUTH_REJECTED_RPC_CODE
  );
}

/**
 * Per-`call` record of whether a bearer was actually attached to the
 * request. Scoped to one `call` (not client state) so concurrent
 * requests can't observe each other's auth state.
 */
interface AttemptAuthState {
  bearerAttached: boolean;
}

/**
 * Generic JSON-RPC 2.0 HTTP client with safe retry policy.
 */
export class JsonRpcClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;
  private requestId = 0;
  private retries: number;
  private retryDelay: number;
  private maxResponseBytes: number;
  private retryableFor: (method: string) => boolean;
  private tokenProvider?: BearerTokenProvider;

  constructor(config: JsonRpcClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout;
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
    this.retries = config.retries ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = config.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
    this.maxResponseBytes =
      config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isFinite(this.maxResponseBytes) || this.maxResponseBytes <= 0) {
      throw new Error("maxResponseBytes must be a positive finite number");
    }
    this.retryableFor = config.retryableFor ?? defaultRetryableFor;
    this.tokenProvider = config.tokenProvider;
  }

  private async buildHeaders(
    method: string,
    authState?: AttemptAuthState,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...this.headers };
    if (this.tokenProvider) {
      const token = await this.tokenProvider.getToken(method);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        if (authState) authState.bearerAttached = true;
      }
    }
    return headers;
  }

  /**
   * Make a JSON-RPC request with optional retry for safe methods.
   *
   * If the server rejects the bearer token and a `tokenProvider` is
   * configured, the client invalidates its cached token and retries the
   * request once with a freshly-acquired bearer.
   *
   * @param method - The RPC method name
   * @param params - The method parameters
   * @param signal - Optional AbortSignal for caller-controlled cancellation
   * @returns The result from the RPC method
   * @throws JsonRpcError if the RPC call fails
   */
  async call<TParams, TResult>(
    method: string,
    params: TParams,
    signal?: AbortSignal,
  ): Promise<TResult> {
    const authState: AttemptAuthState = { bearerAttached: false };
    try {
      return await this.callOnce<TParams, TResult>(
        method,
        params,
        signal,
        authState,
      );
    } catch (error) {
      // The re-auth retry fires for ALL methods, including mutating ones.
      // This is intentional and safe: the server's auth middleware rejects
      // the request BEFORE dispatching to the method handler, so a
      // rejected bearer means the handler never ran and no state was
      // mutated. Confirmed against btc-vault
      // `crates/btc-auth/src/middleware/jsonrpc.rs` — `unauthorized_response`
      // returns without ever calling `service.call(req)`, in both `call`
      // and `batch`. The `retryableFor` guard on HTTP-transient-error
      // retries doesn't apply here because that guard is about retrying
      // after a request the server may have started processing.
      //
      // `bearerAttached` keeps this off methods that sent no token — most
      // importantly the token-issuing calls themselves, which would
      // otherwise burn a round-trip re-minting against the proxy's
      // colliding -32001 "Provider not found".
      //
      // Bounded to one retry: the retried call is not wrapped in this
      // handler. If the freshly-minted token is rejected too, the problem
      // is the pinned server key rather than the token, and that surfaces
      // instead of looping.
      if (
        this.tokenProvider &&
        authState.bearerAttached &&
        isAuthRejectedError(error)
      ) {
        this.tokenProvider.invalidate();
        return await this.callOnce<TParams, TResult>(method, params, signal);
      }
      throw error;
    }
  }

  private async callOnce<TParams, TResult>(
    method: string,
    params: TParams,
    signal: AbortSignal | undefined,
    authState?: AttemptAuthState,
  ): Promise<TResult> {
    const response = await this.fetchWithRetry(
      method,
      params,
      signal,
      authState,
    );

    let jsonResponse: unknown;
    try {
      const responseText = UNCAPPED_TYPED_RESPONSE_METHODS.has(method)
        ? await response.text()
        : await readResponseTextWithLimit(response, this.maxResponseBytes);
      jsonResponse = JSON.parse(responseText);
    } catch (error) {
      if (error instanceof JsonRpcError) {
        throw error;
      }
      throw new JsonRpcError(
        JSON_RPC_ERROR_CODES.INVALID_RESPONSE,
        "Invalid JSON-RPC response: body is not valid JSON",
        "local",
      );
    }

    if (
      jsonResponse === null ||
      typeof jsonResponse !== "object" ||
      Array.isArray(jsonResponse)
    ) {
      throw new JsonRpcError(
        JSON_RPC_ERROR_CODES.INVALID_RESPONSE,
        `Invalid JSON-RPC response: expected an object, got ${typeof jsonResponse}`,
        "local",
      );
    }

    const rpcResponse = jsonResponse as Record<string, unknown>;

    if ("error" in rpcResponse && rpcResponse.error != null) {
      const err = rpcResponse.error as {
        code?: number;
        message?: string;
        data?: unknown;
      };
      throw new JsonRpcError(
        err.code ?? JSON_RPC_ERROR_CODES.INVALID_RESPONSE,
        err.message ?? "Unknown RPC error",
        "wire",
        err.data,
      );
    }

    if (!("result" in rpcResponse)) {
      throw new JsonRpcError(
        JSON_RPC_ERROR_CODES.INVALID_RESPONSE,
        `Invalid JSON-RPC response: missing "result" field`,
        "local",
      );
    }

    return rpcResponse.result as TResult;
  }

  /**
   * Make a JSON-RPC request returning the raw Response (unparsed body).
   *
   * Bearer tokens are injected identically to `call`. **Reactive refresh
   * is NOT performed here** — the response body may be unbounded (e.g.
   * claimer-artifact downloads), so the client refuses to parse it to
   * detect auth errors. Callers relying on token-expired retries for
   * large downloads must read the body themselves and re-invoke
   * `callRaw` after `tokenProvider.invalidate()`.
   */
  async callRaw<TParams>(
    method: string,
    params: TParams,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.fetchWithRetry(method, params, signal);
  }

  private async fetchWithRetry<TParams>(
    method: string,
    params: TParams,
    callerSignal?: AbortSignal,
    authState?: AttemptAuthState,
  ): Promise<Response> {
    const requestId = ++this.requestId;
    const maxRetries = this.retryableFor(method) ? this.retries : 0;

    // jsonrpsee (Rust backend) expects params as an array (positional parameters)
    const request: JsonRpcRequest<TParams[]> = {
      jsonrpc: JSON_RPC_VERSION,
      method,
      params: [params],
      id: requestId,
    };

    const body = JSON.stringify(request);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Merge caller signal with per-request timeout signal
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(
        () => timeoutController.abort(),
        this.timeout,
      );

      const merged = callerSignal
        ? mergeAbortSignals(callerSignal, timeoutController.signal)
        : null;
      const signal = merged ? merged.signal : timeoutController.signal;

      try {
        // Build headers per-attempt so the token provider can return a
        // freshly-acquired bearer after a prior invalidate() on this
        // request (retry loop path) without plumbing state through.
        const headers = await this.buildHeaders(method, authState);

        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers,
          body,
          signal,
        });

        clearTimeout(timeoutId);
        merged?.cleanup();

        if (!response.ok) {
          const shouldRetry =
            attempt < maxRetries &&
            RETRYABLE_HTTP_STATUS_CODES.has(response.status);

          if (shouldRetry) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            await this.sleep(delay, callerSignal);
            continue;
          }

          throw new Error(
            `HTTP error: ${response.status} ${response.statusText}`,
          );
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        merged?.cleanup();
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if caller aborted (not our timeout)
        if (callerSignal?.aborted) {
          throw new Error("Request aborted");
        }

        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < maxRetries) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            await this.sleep(delay, callerSignal);
            continue;
          }
          throw new JsonRpcError(
            JSON_RPC_ERROR_CODES.TIMEOUT,
            `Request timeout after ${this.timeout}ms (${maxRetries + 1} attempts)`,
            "local",
          );
        }

        // Handle network errors (CORS, connection refused, etc.)
        if (error instanceof TypeError) {
          if (attempt < maxRetries) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            await this.sleep(delay, callerSignal);
            continue;
          }
          throw new JsonRpcError(
            JSON_RPC_ERROR_CODES.NETWORK,
            `Network error: ${error.message} (${maxRetries + 1} attempts)`,
            "local",
          );
        }

        // Don't retry JSON-RPC errors (business logic errors)
        throw error;
      }
    }

    throw lastError || new Error("Unknown error after retries");
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Request aborted"));
        return;
      }
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error("Request aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

interface MergedSignal {
  signal: AbortSignal;
  /** Remove listeners from the source signals. Call after the request completes. */
  cleanup: () => void;
}

/**
 * Merge two AbortSignals — the returned signal aborts if either input aborts.
 * Returns a cleanup function to remove listeners when the request completes
 * normally, preventing listener accumulation in long-lived polling flows.
 */
function mergeAbortSignals(a: AbortSignal, b: AbortSignal): MergedSignal {
  if (a.aborted) return { signal: a, cleanup: () => {} };
  if (b.aborted) return { signal: b, cleanup: () => {} };

  const controller = new AbortController();
  const onAbortA = () => {
    b.removeEventListener("abort", onAbortB);
    controller.abort();
  };
  const onAbortB = () => {
    a.removeEventListener("abort", onAbortA);
    controller.abort();
  };
  a.addEventListener("abort", onAbortA, { once: true });
  b.addEventListener("abort", onAbortB, { once: true });

  const cleanup = () => {
    a.removeEventListener("abort", onAbortA);
    b.removeEventListener("abort", onAbortB);
  };

  return { signal: controller.signal, cleanup };
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength);
    if (
      Number.isFinite(parsedContentLength) &&
      parsedContentLength > maxBytes
    ) {
      throw responseTooLargeError(maxBytes);
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let responseText = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw responseTooLargeError(maxBytes);
      }
      responseText += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return responseText + decoder.decode();
}

function responseTooLargeError(maxBytes: number): JsonRpcError {
  return new JsonRpcError(
    JSON_RPC_ERROR_CODES.RESPONSE_TOO_LARGE,
    `JSON-RPC response exceeds maximum size of ${maxBytes} bytes`,
    "local",
  );
}
