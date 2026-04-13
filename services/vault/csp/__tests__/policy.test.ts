import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildCSPDirectives } from "../policy";

/**
 * Snapshot the current env vars we modify so we can restore them after each test.
 */
const ENV_KEYS = [
  "NEXT_PUBLIC_MEMPOOL_API",
  "NEXT_PUBLIC_ETH_RPC_URL",
  "NEXT_PUBLIC_ETH_CHAINID",
  "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
  "NEXT_PUBLIC_TBV_VP_PROXY_URL",
  "NEXT_PUBLIC_TBV_SIDECAR_API_URL",
  "NEXT_PUBLIC_TBV_ORDINALS_API_URL",
] as const;

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of ENV_KEYS) {
    snap[key] = process.env[key];
  }
  return snap;
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnvKeys(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("buildCSPDirectives", () => {
  let originalEnv: EnvSnapshot;

  beforeEach(() => {
    originalEnv = snapshotEnv();
    clearEnvKeys();
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it("includes self and WalletConnect domains in connect-src when no env vars set", () => {
    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain("https://*.walletconnect.com");
    expect(connectSrc).toContain("wss://*.walletconnect.com");
    expect(connectSrc).toContain("https://*.reown.com");
  });

  it("uses BTC mempool fallback origin when NEXT_PUBLIC_MEMPOOL_API is unset", () => {
    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://mempool.space");
  });

  it("uses ETH sepolia fallback when NEXT_PUBLIC_ETH_RPC_URL is unset and chainId is sepolia", () => {
    process.env.NEXT_PUBLIC_ETH_CHAINID = "11155111";

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://ethereum-sepolia-rpc.publicnode.com");
  });

  it("uses ETH mainnet fallback when NEXT_PUBLIC_ETH_RPC_URL is unset and chainId is 1", () => {
    process.env.NEXT_PUBLIC_ETH_CHAINID = "1";

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://ethereum-rpc.publicnode.com");
  });

  it("uses env var origin instead of fallback when explicitly set", () => {
    process.env.NEXT_PUBLIC_MEMPOOL_API = "https://custom-mempool.example.com";
    process.env.NEXT_PUBLIC_ETH_RPC_URL = "https://custom-rpc.example.com";

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://custom-mempool.example.com");
    expect(connectSrc).toContain("https://custom-rpc.example.com");
    expect(connectSrc).not.toContain("https://mempool.space");
    expect(connectSrc).not.toContain("https://ethereum-rpc.publicnode.com");
    expect(connectSrc).not.toContain(
      "https://ethereum-sepolia-rpc.publicnode.com",
    );
  });

  it("includes env var origins in connect-src", () => {
    process.env.NEXT_PUBLIC_MEMPOOL_API = "https://mempool.space/api";
    process.env.NEXT_PUBLIC_ETH_RPC_URL =
      "https://ethereum-sepolia-rpc.publicnode.com";
    process.env.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT =
      "https://indexer.vault-devnet.babylonlabs.io";

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://mempool.space");
    expect(connectSrc).toContain("https://ethereum-sepolia-rpc.publicnode.com");
    expect(connectSrc).toContain("https://indexer.vault-devnet.babylonlabs.io");
  });

  it("extracts origin only, stripping paths from env URLs", () => {
    process.env.NEXT_PUBLIC_MEMPOOL_API = "https://mempool.space/api/v1";

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://mempool.space");
    expect(connectSrc).not.toContain("https://mempool.space/api/v1");
  });

  it("excludes unset optional env vars from connect-src", () => {
    process.env.NEXT_PUBLIC_MEMPOOL_API = "https://mempool.space";
    // NEXT_PUBLIC_TBV_ORDINALS_API_URL intentionally not set

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).toContain("https://mempool.space");
    // No undefined entries
    expect(connectSrc.every((s) => typeof s === "string" && s.length > 0)).toBe(
      true,
    );
  });

  it("falls back to default mempool origin when env var is an invalid URL", () => {
    process.env.NEXT_PUBLIC_MEMPOOL_API = "not-a-url";

    const directives = buildCSPDirectives();
    const connectSrc = directives["connect-src"];

    expect(connectSrc).not.toContain("not-a-url");
    expect(connectSrc).toContain("https://mempool.space");
  });

  it("blocks inline scripts via script-src (no unsafe-inline)", () => {
    const directives = buildCSPDirectives();
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("allows WASM execution via wasm-unsafe-eval", () => {
    const directives = buildCSPDirectives();
    expect(directives["script-src"]).toContain("'wasm-unsafe-eval'");
  });

  it("blocks object embeds", () => {
    const directives = buildCSPDirectives();
    expect(directives["object-src"]).toEqual(["'none'"]);
  });

  it("returns all required directive keys", () => {
    const directives = buildCSPDirectives();
    const expectedKeys = [
      "default-src",
      "script-src",
      "style-src",
      "connect-src",
      "img-src",
      "font-src",
      "worker-src",
      "child-src",
      "object-src",
      "base-uri",
      "form-action",
    ];
    for (const key of expectedKeys) {
      expect(directives).toHaveProperty(key);
    }
  });
});
