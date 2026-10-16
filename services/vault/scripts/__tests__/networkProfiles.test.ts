import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  NETWORKS_DIR,
  listNetworkProfileNamesIn,
  readNetworkProfileFrom,
  readResolvedNetworkProfileFrom,
} from "../lib/networkProfiles";

const PROFILE = {
  name: "alpha",
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

function tempNetworksDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "networks-"));
  writeFileSync(join(dir, "alpha.json"), JSON.stringify(PROFILE));
  writeFileSync(
    join(dir, "beta.json"),
    JSON.stringify({
      ...PROFILE,
      name: "beta",
      overrides: { reason: "r", indexerUrl: "https://other.example" },
    }),
  );
  writeFileSync(join(dir, "notes.md"), "not a profile");
  return dir;
}

describe("listNetworkProfileNamesIn", () => {
  it("lists json files by name, sorted, ignoring other files", () => {
    expect(listNetworkProfileNamesIn(tempNetworksDir())).toEqual([
      "alpha",
      "beta",
    ]);
  });
});

describe("readNetworkProfileFrom", () => {
  it("returns the validated profile with overrides intact", () => {
    const profile = readNetworkProfileFrom(tempNetworksDir(), "beta");
    expect(profile.overrides).toEqual({
      reason: "r",
      indexerUrl: "https://other.example",
    });
  });

  it("names the known profiles when the file does not exist", () => {
    const dir = tempNetworksDir();
    expect(() => readNetworkProfileFrom(dir, "gamma")).toThrow(
      `Unknown network profile "gamma": ${join(dir, "gamma.json")} does not exist. Known: alpha, beta`,
    );
  });

  it("rejects a kind test profile paired with BTC mainnet", () => {
    const dir = tempNetworksDir();
    writeFileSync(
      join(dir, "mispaired.json"),
      JSON.stringify({ ...PROFILE, name: "mispaired", btcNetwork: "mainnet" }),
    );
    expect(() => readNetworkProfileFrom(dir, "mispaired")).toThrow(
      "Invalid network pairing",
    );
  });

  it("rejects a file whose name field does not match the file name", () => {
    const dir = tempNetworksDir();
    writeFileSync(join(dir, "delta.json"), JSON.stringify(PROFILE));
    expect(() => readNetworkProfileFrom(dir, "delta")).toThrow(
      'networks/delta.json declares name "alpha"; the name must equal the file name',
    );
  });
});

describe("readResolvedNetworkProfileFrom", () => {
  it("applies overrides", () => {
    const profile = readResolvedNetworkProfileFrom(tempNetworksDir(), "beta");
    expect(profile.indexerUrl).toBe("https://other.example");
    expect("overrides" in profile).toBe(false);
  });
});

describe("committed network profiles", () => {
  it("carry only strictly checksummed contract addresses", () => {
    for (const name of listNetworkProfileNamesIn(NETWORKS_DIR)) {
      const profile = readNetworkProfileFrom(NETWORKS_DIR, name);
      for (const address of Object.values(profile.contracts)) {
        expect(isAddress(address), `${name}: ${address}`).toBe(true);
      }
    }
  });
});
