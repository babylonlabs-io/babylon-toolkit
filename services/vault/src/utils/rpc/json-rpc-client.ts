/**
 * Generic JSON-RPC 2.0 HTTP Client
 *
 * This is a reusable client for any JSON-RPC 2.0 service.
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

export interface JsonRpcClientConfig {
  /** Base URL of the RPC service */
  baseUrl: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Optional custom headers */
  headers?: Record<string, string>;
  /** Number of retry attempts for transient errors (default: 3) */
  retries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
}

export class JsonRpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "JsonRpcError";
  }
}

/** HTTP status codes that are retryable */
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Generic JSON-RPC 2.0 HTTP client
 */
export class JsonRpcClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;
  private requestId = 0;
  private retries: number;
  private retryDelay: number;

  constructor(config: JsonRpcClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout;
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  /**
   * Make a JSON-RPC request with automatic retry for transient errors
   *
   * @param method - The RPC method name
   * @param params - The method parameters
   * @returns The result from the RPC method
   * @throws JsonRpcError if the RPC call fails after all retries
   */
  async call<TParams, TResult>(
    method: string,
    params: TParams,
  ): Promise<TResult> {
    const requestId = ++this.requestId;

    // jsonrpsee (Rust backend) expects params as an array (positional parameters)
    // Per JSON-RPC 2.0 spec, params can be either an array or object
    // The backend uses jsonrpsee::rpc_params![params] which creates: [params]
    const request: JsonRpcRequest<TParams[]> = {
      jsonrpc: "2.0",
      method,
      params: [params],
      id: requestId,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check if we should retry on HTTP error
        if (!response.ok) {
          const shouldRetry =
            attempt < this.retries &&
            RETRYABLE_STATUS_CODES.includes(response.status);

          if (shouldRetry) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            console.warn(
              `[JsonRpcClient] HTTP ${response.status} for ${method}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retries})`,
            );
            await this.sleep(delay);
            continue;
          }

          throw new Error(
            `HTTP error: ${response.status} ${response.statusText}`,
          );
        }

        const jsonResponse: JsonRpcResponse<TResult> = await response.json();

        // Check for JSON-RPC error response
        if ("error" in jsonResponse) {
          const errorResponse = jsonResponse as JsonRpcErrorResponse;
          throw new JsonRpcError(
            errorResponse.error.code,
            errorResponse.error.message,
            errorResponse.error.data,
          );
        }

        // Return the result
        const successResponse = jsonResponse as JsonRpcSuccessResponse<TResult>;
        return successResponse.result;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));

        // Handle timeout - retryable
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < this.retries) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            console.warn(
              `[JsonRpcClient] Timeout for ${method}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retries})`,
            );
            await this.sleep(delay);
            continue;
          }
          throw new JsonRpcError(
            -32000,
            `Request timeout after ${this.timeout}ms (${this.retries + 1} attempts)`,
          );
        }

        // Handle network errors (CORS, connection refused, etc.) - retryable
        if (error instanceof TypeError) {
          if (attempt < this.retries) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            console.warn(
              `[JsonRpcClient] Network error for ${method}: ${error.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retries})`,
            );
            await this.sleep(delay);
            continue;
          }
          throw new JsonRpcError(
            -32001,
            `Network error: ${error.message} (${this.retries + 1} attempts)`,
          );
        }

        // Don't retry JSON-RPC errors (business logic errors)
        throw error;
      }
    }

    // Should not reach here, but handle just in case
    throw lastError || new Error("Unknown error after retries");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  setHeaders(headers: Record<string, string>): void {
    this.headers = {
      ...this.headers,
      ...headers,
    };
  }
}
