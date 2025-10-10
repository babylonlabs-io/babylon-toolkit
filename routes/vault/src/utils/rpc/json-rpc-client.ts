/**
 * Generic JSON-RPC 2.0 HTTP Client
 *
 * This is a reusable client for any JSON-RPC 2.0 service.
 */

export interface JsonRpcRequest<T = unknown> {
  jsonrpc: '2.0';
  method: string;
  params: T;
  id: number | string;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0';
  result: T;
  id: number | string;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
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
}

export class JsonRpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'JsonRpcError';
  }
}

/**
 * Generic JSON-RPC 2.0 HTTP client
 */
export class JsonRpcClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;
  private requestId = 0;

  constructor(config: JsonRpcClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * Make a JSON-RPC request
   *
   * @param method - The RPC method name
   * @param params - The method parameters
   * @returns The result from the RPC method
   * @throws JsonRpcError if the RPC call fails
   */
  async call<TParams, TResult>(
    method: string,
    params: TParams,
  ): Promise<TResult> {
    const requestId = ++this.requestId;

    const request: JsonRpcRequest<TParams> = {
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP error: ${response.status} ${response.statusText}`,
        );
      }

      const jsonResponse: JsonRpcResponse<TResult> = await response.json();

      // Check for JSON-RPC error response
      if ('error' in jsonResponse) {
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

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JsonRpcError(-32000, `Request timeout after ${this.timeout}ms`);
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new JsonRpcError(-32001, `Network error: ${error.message}`);
      }

      // Re-throw JSON-RPC errors and other errors
      throw error;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
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
