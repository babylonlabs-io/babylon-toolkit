import { describe, expect, it } from "vitest";

import type { NetworkProfile } from "../../src/config/network/profile";
import {
  buildProfile,
  REGISTRY_DERIVED_ENV_KEYS,
  serializeProfile,
  stripRegistryDerivedKeys,
} from "../sync-env";

/** The subset of tbv-networks' network_info.json the generator reads, plus noise it must drop. */
const REGISTRY_DEVNET = {
  btcVaultRef: "0f59266a632943f7f3260e73b24d18b27c25072c",
  btcNetwork: "signet",
  ethChainId: 11155111,
  ethRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  indexerUrl: "https://babylon-vault-indexer-api.vault-devnet.babylonlabs.io",
  vpProxyUrl: "https://vault-provider-proxy-api.vault-devnet.babylonlabs.io",
  contracts: {
    govMultisig: "0x5392147B91f4dCe982CEc4bfF03F6aFb95bDb6E2",
    btcVaultRegistry: "0x3408542836a6115AA62d5b5b6669D29651B07577",
    aaveAdapter: "0xcCFC349D8BDb0fDffe1Bd12Bb0EdaF40adec0686",
    aaveAdapterConfig: "0x64a3825eE4C8b8d9B8c8e29B71c245453a3eDF53",
    btcPriceFeed: "0xA5c0105B71D9D2CaDC151A1875a5B71C85AbF8DB",
  },
};
const COMMIT = "abcdef0123456789abcdef0123456789abcdef01";

describe("buildProfile", () => {
  it("copies only the allowlisted registry fields and records the commit", () => {
    const profile = buildProfile({
      name: "devnet",
      registry: REGISTRY_DEVNET,
      commit: COMMIT,
      existing: null,
      kind: "test",
    });
    expect(profile).toEqual({
      name: "devnet",
      kind: "test",
      registryCommit: COMMIT,
      btcNetwork: "signet",
      ethChainId: 11155111,
      ethRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      indexerUrl:
        "https://babylon-vault-indexer-api.vault-devnet.babylonlabs.io",
      vpProxyUrl:
        "https://vault-provider-proxy-api.vault-devnet.babylonlabs.io",
      contracts: {
        btcVaultRegistry: "0x3408542836a6115AA62d5b5b6669D29651B07577",
        aaveAdapter: "0xcCFC349D8BDb0fDffe1Bd12Bb0EdaF40adec0686",
        aaveAdapterConfig: "0x64a3825eE4C8b8d9B8c8e29B71c245453a3eDF53",
        btcPriceFeed: "0xA5c0105B71D9D2CaDC151A1875a5B71C85AbF8DB",
      },
    });
  });

  it("refuses to create a new profile without an explicit kind", () => {
    expect(() =>
      buildProfile({
        name: "devnet",
        registry: REGISTRY_DEVNET,
        commit: COMMIT,
        existing: null,
        kind: undefined,
      }),
    ).toThrow(
      "networks/devnet.json does not exist yet; pass --kind production|test|internal",
    );
  });

  it("keeps the existing kind and overrides on regeneration", () => {
    const existing: NetworkProfile = {
      ...buildProfile({
        name: "staging",
        registry: REGISTRY_DEVNET,
        commit: "0000000000000000000000000000000000000000",
        existing: null,
        kind: "test",
      }),
      name: "staging",
      overrides: {
        reason: "registry hosts do not resolve",
        indexerUrl: "https://indexer.staging-devnet.example",
      },
    };
    const profile = buildProfile({
      name: "staging",
      registry: REGISTRY_DEVNET,
      commit: COMMIT,
      existing,
      kind: undefined,
    });
    expect(profile.kind).toBe("test");
    expect(profile.overrides).toEqual(existing.overrides);
    expect(profile.registryCommit).toBe(COMMIT);
  });

  it("rejects a --kind that disagrees with the existing file", () => {
    const existing = buildProfile({
      name: "staging",
      registry: REGISTRY_DEVNET,
      commit: COMMIT,
      existing: null,
      kind: "test",
    });
    expect(() =>
      buildProfile({
        name: "staging",
        registry: REGISTRY_DEVNET,
        commit: COMMIT,
        existing,
        kind: "internal",
      }),
    ).toThrow(
      'networks/staging.json has kind "test"; --kind "internal" disagrees — edit the file by hand to reclassify',
    );
  });

  it("lets an existing override stand in for an empty registry endpoint", () => {
    const existing = buildProfile({
      name: "devnet",
      registry: REGISTRY_DEVNET,
      commit: COMMIT,
      existing: null,
      kind: "test",
    });
    const withOverride: NetworkProfile = {
      ...existing,
      overrides: {
        reason: "registry has no proxy",
        vpProxyUrl: "https://proxy.example",
      },
    };
    const profile = buildProfile({
      name: "devnet",
      registry: { ...REGISTRY_DEVNET, vpProxyUrl: "" },
      commit: COMMIT,
      existing: withOverride,
      kind: undefined,
    });
    expect(profile.vpProxyUrl).toBe("https://proxy.example");
    expect(profile.overrides?.vpProxyUrl).toBe("https://proxy.example");
  });

  it("omits btcPriceFeed when the registry has none", () => {
    const { btcPriceFeed: _omitted, ...contracts } = REGISTRY_DEVNET.contracts;
    const profile = buildProfile({
      name: "devnet",
      registry: { ...REGISTRY_DEVNET, contracts },
      commit: COMMIT,
      existing: null,
      kind: "test",
    });
    expect("btcPriceFeed" in profile.contracts).toBe(false);
  });

  it("fails on a registry entry the validator rejects, naming the field", () => {
    expect(() =>
      buildProfile({
        name: "devnet",
        registry: { ...REGISTRY_DEVNET, vpProxyUrl: "" },
        commit: COMMIT,
        existing: null,
        kind: "test",
      }),
    ).toThrow("vpProxyUrl must be a non-empty string");
  });
});

describe("serializeProfile", () => {
  it("writes keys in a fixed order with two-space indent and a trailing newline", () => {
    const profile = buildProfile({
      name: "devnet",
      registry: REGISTRY_DEVNET,
      commit: COMMIT,
      existing: null,
      kind: "test",
    });
    const text = serializeProfile({
      ...profile,
      overrides: { reason: "r", vpProxyUrl: "https://p.example" },
    });
    expect(text.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual([
      "name",
      "kind",
      "registryCommit",
      "btcNetwork",
      "ethChainId",
      "ethRpcUrl",
      "indexerUrl",
      "vpProxyUrl",
      "contracts",
      "overrides",
    ]);
    expect(text).toBe(serializeProfile(JSON.parse(text)));
  });
});

describe("stripRegistryDerivedKeys", () => {
  it("removes the eight moved keys and keeps everything else byte for byte", () => {
    const input = [
      "# header",
      "NEXT_PUBLIC_BTC_NETWORK=signet",
      "NEXT_PUBLIC_REOWN_PROJECT_ID=abc",
      "",
      "# Added by sync-env from devnet",
      "NEXT_PUBLIC_TBV_BTC_PRICE_FEED=0xA5c0105B71D9D2CaDC151A1875a5B71C85AbF8DB",
      "NEXT_PUBLIC_FF_PROTOCOL_PAUSED=false",
      "",
    ].join("\n");
    const { content, removed } = stripRegistryDerivedKeys(input);
    expect(removed).toEqual([
      "NEXT_PUBLIC_BTC_NETWORK",
      "NEXT_PUBLIC_TBV_BTC_PRICE_FEED",
    ]);
    expect(content).toBe(
      [
        "# header",
        "NEXT_PUBLIC_REOWN_PROJECT_ID=abc",
        "",
        "# Added by sync-env from devnet",
        "NEXT_PUBLIC_FF_PROTOCOL_PAUSED=false",
        "",
      ].join("\n"),
    );
  });

  it("names exactly the variables that moved into profiles", () => {
    expect([...REGISTRY_DERIVED_ENV_KEYS]).toEqual([
      "NEXT_PUBLIC_BTC_NETWORK",
      "NEXT_PUBLIC_ETH_CHAINID",
      "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
      "NEXT_PUBLIC_TBV_VP_PROXY_URL",
      "NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY",
      "NEXT_PUBLIC_TBV_AAVE_ADAPTER",
      "NEXT_PUBLIC_TBV_AAVE_ADAPTER_CONFIG",
      "NEXT_PUBLIC_TBV_BTC_PRICE_FEED",
    ]);
  });
});
