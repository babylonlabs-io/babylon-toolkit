import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ENV,
  envInitError,
  readInlinedProfile,
  resolveAnalyticsConfig,
  resolveEthRpcUrl,
} from "@/config/env";

const PROFILE = {
  name: "devnet",
  kind: "test",
  registryCommit: null,
  btcNetwork: "signet",
  ethChainId: 11155111,
  ethRpcUrl: "https://rpc.example",
  indexerUrl: "https://indexer.example",
  vpProxyUrl: "https://proxy.example",
  contracts: {
    btcVaultRegistry: "0x3408542836a6115AA62d5b5b6669D29651B07577",
    aaveAdapter: "0xcCFC349D8BDb0fDffe1Bd12Bb0EdaF40adec0686",
    aaveAdapterConfig: "0x64a3825eE4C8b8d9B8c8e29B71c245453a3eDF53",
  },
};

describe("readInlinedProfile", () => {
  it("returns the profile and records no error for valid JSON", () => {
    const errors: string[] = [];
    expect(readInlinedProfile(JSON.stringify(PROFILE), errors)).toEqual(
      PROFILE,
    );
    expect(errors).toEqual([]);
  });

  it("records an error and returns the inert fallback when nothing was inlined", () => {
    const errors: string[] = [];
    const profile = readInlinedProfile(undefined, errors);
    expect(errors).toEqual([
      "network profile was not inlined at build time (import.meta.env.TBV_NETWORK_PROFILE is empty)",
    ]);
    expect(profile.ethRpcUrl).toBe("https://invalid.local");
    expect(profile.contracts.btcVaultRegistry).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("surfaces the dev-server error marker as the configuration error", () => {
    const errors: string[] = [];
    readInlinedProfile(
      JSON.stringify({ $error: 'Unknown network profile "nope"' }),
      errors,
    );
    expect(errors).toEqual(['network profile: Unknown network profile "nope"']);
  });

  it("records a validator problem instead of throwing", () => {
    const errors: string[] = [];
    readInlinedProfile(JSON.stringify({ ...PROFILE, ethChainId: 5 }), errors);
    expect(errors[0]).toContain("ethChainId must be 1 or 11155111, got 5");
  });

  it("records a JSON parse failure", () => {
    const errors: string[] = [];
    readInlinedProfile("{not json", errors);
    expect(errors).toEqual(["network profile is not valid JSON"]);
  });
});

describe("ENV", () => {
  it("is populated from the inlined e2e-replay profile", () => {
    expect(envInitError).toBeNull();
    expect(ENV.GRAPHQL_ENDPOINT).toBe("http://localhost:9999/graphql");
    expect(ENV.VP_PROXY_URL).toBe("http://localhost:9998");
    expect(ENV.BTC_VAULT_REGISTRY).toBe(
      "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
    );
  });
});

describe("ENV with a mispaired profile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sets envInitError and exports the inert fallback values", async () => {
    vi.resetModules();
    vi.stubEnv(
      "TBV_NETWORK_PROFILE",
      JSON.stringify({ ...PROFILE, kind: "test", btcNetwork: "mainnet" }),
    );
    const env = await import("@/config/env");
    expect(env.envInitError).toContain(
      'Invalid network pairing for kind "test"',
    );
    expect(env.ENV.BTC_VAULT_REGISTRY).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("turns analytics off even when its own settings are valid", async () => {
    vi.resetModules();
    vi.stubEnv(
      "TBV_NETWORK_PROFILE",
      JSON.stringify({ ...PROFILE, kind: "test", btcNetwork: "mainnet" }),
    );
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_KEY", "phc_abc123");
    const env = await import("@/config/env");
    expect(env.envInitError).not.toBeNull();
    expect(env.ENV.ANALYTICS).toEqual({ enabled: false });
  });
});

describe("ENV with valid analytics settings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("turns analytics on for the profile's network", async () => {
    vi.resetModules();
    vi.stubEnv("TBV_NETWORK_PROFILE", JSON.stringify(PROFILE));
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_KEY", "phc_abc123");
    const env = await import("@/config/env");
    expect(env.envInitError).toBeNull();
    expect(env.analyticsConfigError).toBeNull();
    expect(env.ENV.ANALYTICS).toEqual({
      enabled: true,
      host: "https://us.i.posthog.com",
      projectKey: "phc_abc123",
      network: "devnet",
    });
  });
});

describe("ENV with a bad analytics setting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("turns analytics off without blocking the app", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_KEY", "");
    const env = await import("@/config/env");
    expect(env.envInitError).toBeNull();
    expect(env.ENV.ANALYTICS).toEqual({ enabled: false });
    expect(env.analyticsConfigError).toBe(
      "Product analytics is off: NEXT_PUBLIC_POSTHOG_HOST is set but NEXT_PUBLIC_POSTHOG_PROJECT_KEY is not; set both or neither",
    );
    expect(env.ENV.BTC_VAULT_REGISTRY).toBe(
      "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
    );
  });
});

describe("resolveEthRpcUrl", () => {
  const PROFILE_RPC = "https://rpc.example";

  it("uses the profile RPC when the override is unset or blank", () => {
    const errors: string[] = [];
    expect(resolveEthRpcUrl(undefined, PROFILE_RPC, errors)).toBe(PROFILE_RPC);
    expect(resolveEthRpcUrl("   ", PROFILE_RPC, errors)).toBe(PROFILE_RPC);
    expect(errors).toEqual([]);
  });

  it("uses a valid override, trimmed and without a trailing slash", () => {
    const errors: string[] = [];
    expect(
      resolveEthRpcUrl(" https://node.example/ ", PROFILE_RPC, errors),
    ).toBe("https://node.example");
    expect(errors).toEqual([]);
  });

  it("records an error and refuses any RPC when the override is not a URL", () => {
    const errors: string[] = [];
    expect(resolveEthRpcUrl("node.example", PROFILE_RPC, errors)).toBe(
      "https://invalid.local",
    );
    expect(errors).toEqual([
      'NEXT_PUBLIC_ETH_RPC_URL is not a valid URL: "node.example"',
    ]);
  });

  it("records an error when the override uses a non-http scheme", () => {
    const errors: string[] = [];
    expect(resolveEthRpcUrl("wss://node.example", PROFILE_RPC, errors)).toBe(
      "https://invalid.local",
    );
    expect(errors).toEqual([
      'NEXT_PUBLIC_ETH_RPC_URL must use http or https scheme, got: "wss:"',
    ]);
  });
});

describe("resolveAnalyticsConfig", () => {
  const KEY = "phc_abc123";

  it("is off without an error when neither variable is set", () => {
    const errors: string[] = [];
    expect(resolveAnalyticsConfig(undefined, "  ", "devnet", errors)).toEqual({
      enabled: false,
    });
    expect(errors).toEqual([]);
  });

  it("is on with a trimmed host, no trailing slash, and the network name", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        " https://us.i.posthog.com/ ",
        ` ${KEY} `,
        "devnet",
        errors,
      ),
    ).toEqual({
      enabled: true,
      host: "https://us.i.posthog.com",
      projectKey: KEY,
      network: "devnet",
    });
    expect(errors).toEqual([]);
  });

  it("records an error when only the project key is set", () => {
    const errors: string[] = [];
    expect(resolveAnalyticsConfig("", KEY, "devnet", errors)).toEqual({
      enabled: false,
    });
    expect(errors).toEqual([
      "NEXT_PUBLIC_POSTHOG_PROJECT_KEY is set but NEXT_PUBLIC_POSTHOG_HOST is not; set both or neither",
    ]);
  });

  it("records an error when only the host is set", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://us.i.posthog.com",
        undefined,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      "NEXT_PUBLIC_POSTHOG_HOST is set but NEXT_PUBLIC_POSTHOG_PROJECT_KEY is not; set both or neither",
    ]);
  });

  it("records an error when the host is not a URL", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig("us.i.posthog.com", KEY, "devnet", errors),
    ).toEqual({
      enabled: false,
    });
    expect(errors).toEqual(["NEXT_PUBLIC_POSTHOG_HOST is not a valid URL"]);
  });

  it("records an error without echoing an unparseable host that carries credentials", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://user:hunter2@us.i.posthog.com:notaport",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual(["NEXT_PUBLIC_POSTHOG_HOST is not a valid URL"]);
  });

  it("records an error when the host is not https", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig("http://us.i.posthog.com", KEY, "devnet", errors),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      'NEXT_PUBLIC_POSTHOG_HOST must use https, got: "http:"',
    ]);
  });

  it("accepts a host with a path, for a same-domain proxy", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://vault.example/ingest/",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({
      enabled: true,
      host: "https://vault.example/ingest",
      projectKey: KEY,
      network: "devnet",
    });
    expect(errors).toEqual([]);
  });

  it("records an error without echoing the host when it carries credentials", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://user:hunter2@us.i.posthog.com",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      "NEXT_PUBLIC_POSTHOG_HOST must be an https origin with an optional path, without credentials, a query or a fragment",
    ]);
  });

  it("records an error when the host carries only a username", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://user@us.i.posthog.com",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      "NEXT_PUBLIC_POSTHOG_HOST must be an https origin with an optional path, without credentials, a query or a fragment",
    ]);
  });

  it("records an error when the host carries only a password", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://:hunter2@us.i.posthog.com",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      "NEXT_PUBLIC_POSTHOG_HOST must be an https origin with an optional path, without credentials, a query or a fragment",
    ]);
  });

  it("records an error when the host has a query", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://us.i.posthog.com?x=1",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toHaveLength(1);
  });

  it("records an error when the host ends in an empty fragment", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://us.i.posthog.com#",
        KEY,
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toHaveLength(1);
  });

  it("records an error when a phc_ key carries characters other than letters and digits", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://us.i.posthog.com",
        "phc_abc-!",
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      'NEXT_PUBLIC_POSTHOG_PROJECT_KEY must be a PostHog project key ("phc_" followed by letters and digits)',
    ]);
  });

  it("records an error when the key is not a PostHog project key", () => {
    const errors: string[] = [];
    expect(
      resolveAnalyticsConfig(
        "https://us.i.posthog.com",
        "phx_secret",
        "devnet",
        errors,
      ),
    ).toEqual({ enabled: false });
    expect(errors).toEqual([
      'NEXT_PUBLIC_POSTHOG_PROJECT_KEY must be a PostHog project key ("phc_" followed by letters and digits)',
    ]);
  });
});
