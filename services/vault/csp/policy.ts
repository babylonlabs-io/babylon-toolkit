/**
 * Content Security Policy configuration for the vault application.
 *
 * Runs at Vite build time (Node.js context) to construct an environment-specific
 * CSP from NEXT_PUBLIC_* env vars. The resulting policy is injected as a
 * <meta http-equiv="Content-Security-Policy"> tag by vite-plugin-csp-guard.
 */

/** Domains required by WalletConnect / Reown wallet infrastructure */
const WALLET_CONNECT_DOMAINS = [
  "https://*.walletconnect.com",
  "wss://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.org",
  "https://*.reown.com",
  "wss://*.reown.com",
] as const;

/**
 * Env vars whose values are URLs that the app fetches at runtime.
 * Each is included in `connect-src` when set.
 */
const CONNECT_SRC_ENV_KEYS = [
  "NEXT_PUBLIC_MEMPOOL_API",
  "NEXT_PUBLIC_ETH_RPC_URL",
  "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
  "NEXT_PUBLIC_TBV_VP_PROXY_URL",
  "NEXT_PUBLIC_TBV_SIDECAR_API_URL",
  "NEXT_PUBLIC_TBV_ORDINALS_API_URL",
] as const;

/**
 * Extract the origin (scheme + host + port) from a URL string.
 * Returns `undefined` for invalid URLs so callers can filter them out.
 */
function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * Collect API origins from env vars and combine with static wallet domains.
 */
function buildConnectSources(): string[] {
  const envOrigins = CONNECT_SRC_ENV_KEYS.map((key) => process.env[key])
    .filter((v): v is string => Boolean(v?.trim()))
    .map(originOf)
    .filter((v): v is string => v !== undefined);

  return ["'self'", ...envOrigins, ...WALLET_CONNECT_DOMAINS];
}

export type CSPDirectives = Record<string, string[]>;

/**
 * Build the full CSP directives object for vite-plugin-csp-guard.
 *
 * Design decisions:
 * - `'wasm-unsafe-eval'` in script-src: required for babylon-tbv-rust-wasm WASM execution
 * - `'unsafe-inline'` in style-src only: some UI libraries inject <style> tags; low risk
 * - `img-src https:`: vault provider logos are loaded from various external origins
 * - `worker-src blob:` / `child-src blob:`: WASM and node polyfills may use blob workers
 * - No `'unsafe-inline'` or `'unsafe-eval'` in script-src (hashes are added by the plugin)
 */
export function buildCSPDirectives(): CSPDirectives {
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'wasm-unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "connect-src": buildConnectSources(),
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
}
