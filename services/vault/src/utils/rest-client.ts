import { ApiError, ErrorCode } from "./errors/types";

/**
 * Generic REST API HTTP Client
 *
 * This is a reusable client for REST API services with timeout handling and error management.
 */

export interface RestClientConfig {
  /** Base URL of the REST API service */
  baseUrl: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Optional custom headers */
  headers?: Record<string, string>;
}

export class RestClientError extends ApiError {
  constructor(
    status: number,
    message: string,
    response?: string,
  ) {
    const code = getErrorCodeFromStatus(status);
    super(message, status, code, response);
    this.name = "RestClientError";
  }
}

function getErrorCodeFromStatus(status: number): ErrorCode {
  if (status === 0) {
    return ErrorCode.NETWORK_ERROR;
  }
  if (status === 408) {
    return ErrorCode.API_TIMEOUT;
  }
  if (status === 401 || status === 403) {
    return ErrorCode.API_UNAUTHORIZED;
  }
  if (status === 404) {
    return ErrorCode.API_NOT_FOUND;
  }
  if (status >= 500) {
    return ErrorCode.API_SERVER_ERROR;
  }
  if (status >= 400) {
    return ErrorCode.API_CLIENT_ERROR;
  }
  return ErrorCode.API_ERROR;
}

/**
 * Generic REST API HTTP client with timeout handling
 */
export class RestClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: RestClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout;
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
  }

  /**
   * Fetch data from the API with error handling and timeout
   *
   * @param endpoint - The API endpoint (will be appended to baseUrl)
   * @param options - Optional fetch options (method, body, etc.)
   * @returns The parsed JSON response
   * @throws RestClientError if the request fails
   */
  async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.headers,
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new RestClientError(
          response.status,
          `API request failed: ${response.status} ${response.statusText}. ${errorText}`,
          errorText,
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new RestClientError(
            408,
            `Request timeout after ${this.timeout}ms`,
          );
        }
        if (error instanceof RestClientError) {
          throw error;
        }
        throw new RestClientError(0, `Network error: ${error.message}`);
      }
      throw new RestClientError(0, "Unknown error occurred during API request");
    }
  }

  /**
   * Convenience method for GET requests
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.fetch<T>(endpoint, { method: "GET" });
  }

  /**
   * Convenience method for POST requests
   */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.fetch<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Convenience method for PUT requests
   */
  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.fetch<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Convenience method for DELETE requests
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.fetch<T>(endpoint, { method: "DELETE" });
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
