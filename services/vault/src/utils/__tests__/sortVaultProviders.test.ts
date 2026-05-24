import { describe, expect, it } from "vitest";

import type { VaultProviderListItem } from "@/types/vaultProvider";

import { sortVaultProviders } from "../sortVaultProviders";

/** Build a list item with healthy defaults; override per test. */
function makeProvider(
  overrides: Partial<VaultProviderListItem> & { id: string; name: string },
): VaultProviderListItem {
  return {
    btcPubkey: "0xpub",
    unavailable: false,
    unhealthy: false,
    explorerUrl: `https://explorer.example/provider/${overrides.id}`,
    ...overrides,
  };
}

describe("sortVaultProviders", () => {
  it("ranks healthy providers by most recent successful peg-in, newest first", () => {
    const older = makeProvider({
      id: "0xolder",
      name: "Older",
      lastSuccessfulPeginAt: 1_000,
    });
    const newer = makeProvider({
      id: "0xnewer",
      name: "Newer",
      lastSuccessfulPeginAt: 2_000,
    });

    const sorted = sortVaultProviders([older, newer]);

    expect(sorted.map((p) => p.id)).toEqual(["0xnewer", "0xolder"]);
  });

  it("places providers with no successful peg-in after those that have one", () => {
    const withPegin = makeProvider({
      id: "0xwith",
      name: "Zzz With Pegin",
      lastSuccessfulPeginAt: 5_000,
    });
    const withoutPegin = makeProvider({
      id: "0xwithout",
      name: "Aaa Without Pegin",
    });

    const sorted = sortVaultProviders([withoutPegin, withPegin]);

    expect(sorted.map((p) => p.id)).toEqual(["0xwith", "0xwithout"]);
  });

  it("sinks runtime-unhealthy providers below all healthy providers", () => {
    const unhealthy = makeProvider({
      id: "0xunhealthy",
      name: "Unhealthy",
      unhealthy: true,
      lastSuccessfulPeginAt: 9_999,
    });
    const healthyNoPegin = makeProvider({
      id: "0xhealthy",
      name: "Healthy",
    });

    const sorted = sortVaultProviders([unhealthy, healthyNoPegin]);

    // The unhealthy VP has the most recent peg-in but still sorts last.
    expect(sorted.map((p) => p.id)).toEqual(["0xhealthy", "0xunhealthy"]);
  });

  it("sinks metadata-rejected providers below all healthy providers", () => {
    const rejected = makeProvider({
      id: "0xrejected",
      name: "Rejected",
      unavailable: true,
      lastSuccessfulPeginAt: 9_999,
    });
    const healthy = makeProvider({
      id: "0xhealthy",
      name: "Healthy",
      lastSuccessfulPeginAt: 1,
    });

    const sorted = sortVaultProviders([rejected, healthy]);

    expect(sorted.map((p) => p.id)).toEqual(["0xhealthy", "0xrejected"]);
  });

  it("breaks ties alphabetically by name", () => {
    const charlie = makeProvider({ id: "0x3", name: "Charlie" });
    const alice = makeProvider({ id: "0x1", name: "Alice" });
    const bob = makeProvider({ id: "0x2", name: "Bob" });

    const sorted = sortVaultProviders([charlie, alice, bob]);

    expect(sorted.map((p) => p.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      makeProvider({ id: "0xb", name: "B", lastSuccessfulPeginAt: 1 }),
      makeProvider({ id: "0xa", name: "A", lastSuccessfulPeginAt: 2 }),
    ];
    const inputOrder = input.map((p) => p.id);

    sortVaultProviders(input);

    expect(input.map((p) => p.id)).toEqual(inputOrder);
  });
});
