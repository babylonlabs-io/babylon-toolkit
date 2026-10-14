import { afterEach, describe, expect, it, vi } from "vitest";

import { ENV, envInitError, readInlinedProfile } from "@/config/env";

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
});
