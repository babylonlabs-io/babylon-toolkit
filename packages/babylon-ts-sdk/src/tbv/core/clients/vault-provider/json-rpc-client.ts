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
 * notified on auth-expired responses so it can invalidate its cache.
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
   * Predicate to determine if a method is safe to retry.
   * Default: only retry `vaultProvider_getPeginStatus` and `vaultProvider_getPegoutStatus`.
   * Write/mutating methods are NOT retried by default.
   */
  retryableFor?: (method: string) => boolean;
  /**
   * Optional bearer-token provider. If set, the client injects
   * `Authorization: Bearer <token>` for every method the provider
   * returns a non-null token for (`call` and `callRaw` alike).
   *
   * `call` also performs a one-shot reactive refresh when a wire-origin
   * JSON-RPC error carries `error.data.kind === "auth_expired"` —
   * it calls `invalidate()`, fetches a fresh token, and retries the
   * request once. `callRaw` does NOT perform reactive refresh (its
   * body may be unbounded; we don't parse it).
   */
  tokenProvider?: BearerTokenProvider;
}

/**
 * Identifies whether an error was produced locally (timeout, network
 * failure, malformed response) or parsed from a wire-format JSON-RPC
 * error envelope returned by the server.
 *
 * This matters for anyone inspecting the shared `-32001` code: the SDK
 * uses it internally for network failures AND the server uses it for
 * auth-middleware rejections. The `source` field disambiguates.
 */
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
} as const;

/** JSON-RPC protocol version */
const JSON_RPC_VERSION = "2.0" as const;

/** Default number of retry attempts for transient errors */
const DEFAULT_RETRY_ATTEMPTS = 3;

/** Default initial retry delay in milliseconds */
const DEFAULT_RETRY_DELAY_MS = 1000;

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
  "vaultProvider_getPeginStatus",
  "vaultProvider_getPegoutStatus",
  "vaultProvider_requestDepositorPresignTransactions",
]);

function defaultRetryableFor(method: string): boolean {
  return DEFAULT_RETRYABLE_METHODS.has(method);
}

/**
 * Token-expired marker the server emits in `error.data.kind`. When
 * present on a wire-origin error, the client invalidates its cached
 * token and retries the request once with a freshly-acquired bearer.
 *
 * Kept in sync with btc-vault's auth middleware. Absence of the marker
 * means the server does not support reactive refresh yet; we fall back
 * to proactive-only refresh via `BearerTokenProvider.getToken()` TTL
 * checks.
 */
const AUTH_EXPIRED_DATA_KIND = "auth_expired";

function isAuthExpiredError(error: unknown): boolean {
  if (!(error instanceof JsonRpcError)) return false;
  if (error.source !== "wire") return false;
  const data = error.data;
  if (data === null || typeof data !== "object") return false;
  const kind = (data as { kind?: unknown }).kind;
  return kind === AUTH_EXPIRED_DATA_KIND;
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
    this.retryableFor = config.retryableFor ?? defaultRetryableFor;
    this.tokenProvider = config.tokenProvider;
  }

  private async buildHeaders(method: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...this.headers };
    if (this.tokenProvider) {
      const token = await this.tokenProvider.getToken(method);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return headers;
  }

  /**
   * Make a JSON-RPC request with optional retry for safe methods.
   *
   * If the request fails with a wire-origin `auth_expired` error and a
   * `tokenProvider` is configured, the client invalidates its cached
   * token and retries the request once with a freshly-acquired bearer.
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
    try {
      return await this.callOnce<TParams, TResult>(method, params, signal);
    } catch (error) {
      // The auth-expired retry fires for ALL methods, including mutating
      // ones. This is intentional and safe: the server's auth middleware
      // validates the bearer token BEFORE dispatching to the method
      // handler, so an `auth_expired` error means the handler never ran
      // and no state was mutated. Confirmed against btc-vault at
      // `crates/btc-auth/src/middleware/jsonrpc.rs` — token validation
      // is pre-handler only. The `retryableFor` guard on
      // HTTP-transient-error retries doesn't apply here because that
      // guard is about retrying after a request the server may have
      // started processing; auth_expired is categorically different.
      if (this.tokenProvider && isAuthExpiredError(error)) {
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
  ): Promise<TResult> {
    const response = await this.fetchWithRetry(method, params, signal);

    let jsonResponse: unknown;
    try {
      jsonResponse = await response.json();
    } catch {
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
        const headers = await this.buildHeaders(method);

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
