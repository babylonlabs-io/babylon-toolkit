import { describe, expect, it } from "vitest";

import {
  assertPairingAllowed,
  parseNetworkProfile,
  resolveNetworkProfile,
} from "../profile";

const VALID_PROFILE = {
  name: "devnet",
  kind: "test",
  registryCommit: "0f59266a632943f7f3260e73b24d18b27c25072c",
  btcNetwork: "signet",
  ethChainId: 11155111,
  ethRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  indexerUrl: "https://babylon-vault-indexer-api.vault-devnet.babylonlabs.io",
  vpProxyUrl: "https://vault-provider-proxy-api.vault-devnet.babylonlabs.io",
  contracts: {
    btcVaultRegistry: "0x3408542836a6115AA62d5b5b6669D29651B07577",
    aaveAdapter: "0xcCFC349D8BDb0fDffe1Bd12Bb0EdaF40adec0686",
    aaveAdapterConfig: "0x64a3825eE4C8b8d9B8c8e29B71c245453a3eDF53",
    btcPriceFeed: "0xA5c0105B71D9D2CaDC151A1875a5B71C85AbF8DB",
  },
};

describe("parseNetworkProfile", () => {
  it("accepts a complete registry-backed profile", () => {
    expect(parseNetworkProfile(VALID_PROFILE)).toEqual(VALID_PROFILE);
  });

  it("accepts a hand-written profile with registryCommit null and no btcPriceFeed", () => {
    const { btcPriceFeed, ...contracts } = VALID_PROFILE.contracts;
    void btcPriceFeed;
    const profile = {
      ...VALID_PROFILE,
      name: "e2e-replay",
      registryCommit: null,
      contracts,
    };
    expect(parseNetworkProfile(profile)).toEqual(profile);
  });

  it("rejects a non-object", () => {
    expect(() => parseNetworkProfile("devnet")).toThrow(
      "Invalid network profile: expected an object",
    );
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      parseNetworkProfile({ ...VALID_PROFILE, kind: "staging" }),
    ).toThrow('kind must be one of production, test, internal, got "staging"');
  });

  it("rejects a name with characters other than lowercase letters, digits and dashes", () => {
    expect(() =>
      parseNetworkProfile({ ...VALID_PROFILE, name: "Dev Net" }),
    ).toThrow('name must match /^[a-z0-9][a-z0-9-]*$/, got "Dev Net"');
  });

  it("rejects an unsupported ethChainId", () => {
    expect(() =>
      parseNetworkProfile({ ...VALID_PROFILE, ethChainId: 10 }),
    ).toThrow("ethChainId must be 1 or 11155111, got 10");
  });

  it("rejects an endpoint with a trailing slash", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        indexerUrl: "https://indexer.example/",
      }),
    ).toThrow('indexerUrl must not end with "/"');
  });

  it("rejects an endpoint that is not http or https", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        vpProxyUrl: "ftp://proxy.example",
      }),
    ).toThrow("vpProxyUrl must be an http(s) URL");
  });

  it("rejects a malformed contract address", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        contracts: { ...VALID_PROFILE.contracts, aaveAdapter: "0x1234" },
      }),
    ).toThrow(
      'contracts.aaveAdapter must be a 20-byte hex address, got "0x1234"',
    );
  });

  it("rejects the zero address for a contract", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        contracts: {
          ...VALID_PROFILE.contracts,
          btcVaultRegistry: "0x0000000000000000000000000000000000000000",
        },
      }),
    ).toThrow("contracts.btcVaultRegistry must not be the zero address");
  });

  it("rejects an empty registryCommit", () => {
    expect(() =>
      parseNetworkProfile({ ...VALID_PROFILE, registryCommit: "" }),
    ).toThrow("registryCommit must be a 40-hex commit sha or null");
  });

  it("rejects a test profile paired with BTC mainnet", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        kind: "test",
        btcNetwork: "mainnet",
      }),
    ).toThrow('Invalid network pairing for kind "test"');
  });

  it("accepts an internal profile paired with BTC mainnet and ETH Sepolia", () => {
    const profile = {
      ...VALID_PROFILE,
      kind: "internal",
      btcNetwork: "mainnet",
    };
    expect(parseNetworkProfile(profile)).toEqual(profile);
  });

  it("reports every problem at once", () => {
    expect(() =>
      parseNetworkProfile({ ...VALID_PROFILE, kind: "x", ethChainId: 2 }),
    ).toThrow(/kind must be one of.*; ethChainId must be 1 or 11155111/);
  });

  it("rejects overrides that name a contract or pairing field", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        overrides: { reason: "test", btcNetwork: "mainnet" },
      }),
    ).toThrow(
      "overrides may only set ethRpcUrl, indexerUrl, vpProxyUrl, got btcNetwork",
    );
  });

  it("rejects overrides without a reason", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        overrides: { indexerUrl: "https://other.example" },
      }),
    ).toThrow("overrides.reason must be a non-empty string");
  });

  it("validates override endpoints like the fields they replace", () => {
    expect(() =>
      parseNetworkProfile({
        ...VALID_PROFILE,
        overrides: { reason: "test", indexerUrl: "https://other.example/" },
      }),
    ).toThrow('overrides.indexerUrl must not end with "/"');
  });

  it("rejects unknown top-level keys so a registry field cannot sneak in", () => {
    expect(() =>
      parseNetworkProfile({ ...VALID_PROFILE, govMultisig: "0x1" }),
    ).toThrow("unexpected key govMultisig");
  });
});

describe("resolveNetworkProfile", () => {
  it("returns the profile unchanged when there are no overrides", () => {
    const profile = parseNetworkProfile(VALID_PROFILE);
    expect(resolveNetworkProfile(profile)).toEqual(profile);
  });

  it("applies endpoint overrides and drops the overrides block", () => {
    const profile = parseNetworkProfile({
      ...VALID_PROFILE,
      overrides: {
        reason: "registry hosts do not resolve",
        indexerUrl: "https://indexer.staging-devnet.example",
      },
    });
    const resolved = resolveNetworkProfile(profile);
    expect(resolved.indexerUrl).toBe("https://indexer.staging-devnet.example");
    expect(resolved.vpProxyUrl).toBe(VALID_PROFILE.vpProxyUrl);
    expect("overrides" in resolved).toBe(false);
  });
});

describe("assertPairingAllowed", () => {
  it("allows production with BTC mainnet and ETH mainnet", () => {
    expect(() =>
      assertPairingAllowed({
        kind: "production",
        btcNetwork: "mainnet",
        ethChainId: 1,
      }),
    ).not.toThrow();
  });

  it("allows test with BTC signet and ETH Sepolia", () => {
    expect(() =>
      assertPairingAllowed({
        kind: "test",
        btcNetwork: "signet",
        ethChainId: 11155111,
      }),
    ).not.toThrow();
  });

  it("allows internal with BTC mainnet and ETH Sepolia", () => {
    expect(() =>
      assertPairingAllowed({
        kind: "internal",
        btcNetwork: "mainnet",
        ethChainId: 11155111,
      }),
    ).not.toThrow();
  });

  it("rejects BTC mainnet with ETH Sepolia unless the kind is internal", () => {
    expect(() =>
      assertPairingAllowed({
        kind: "test",
        btcNetwork: "mainnet",
        ethChainId: 11155111,
      }),
    ).toThrow(
      'Invalid network pairing for kind "test": btcNetwork="mainnet" with ethChainId=11155111. Allowed: production=mainnet+1, test=signet+11155111, internal=mainnet+11155111.',
    );
  });

  it("rejects BTC signet with ETH mainnet for every kind", () => {
    for (const kind of ["production", "test", "internal"] as const) {
      expect(() =>
        assertPairingAllowed({ kind, btcNetwork: "signet", ethChainId: 1 }),
      ).toThrow("Invalid network pairing");
    }
  });

  it("rejects production with a test pairing", () => {
    expect(() =>
      assertPairingAllowed({
        kind: "production",
        btcNetwork: "signet",
        ethChainId: 11155111,
      }),
    ).toThrow("Invalid network pairing");
  });
});
