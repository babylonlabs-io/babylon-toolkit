/**
 * Health snapshot for a single vault provider, as returned by the
 * vault-provider-proxy `/vp-health` endpoint.
 *
 * The proxy tracks request metrics within a sliding window. Only VPs
 * that received traffic in that window appear in the response.
 */
export interface VpHealthSnapshot {
  /** Vault provider Ethereum address */
  address: string;
  /** Total requests within the sliding window */
  totalRequests: number;
  /** Requests with HTTP 2xx–4xx (considered successful from proxy's perspective) */
  successCount: number;
  /** Requests that failed (5xx, timeouts, network errors) */
  errorCount: number;
  /** Success ratio (0–1) */
  successRate: number;
  /** Count of HTTP 5xx responses specifically */
  error5xxCount: number;
  /** Average response time in ms */
  avgResponseMs: number;
  /** 95th percentile response time in ms */
  p95ResponseMs: number;
}
