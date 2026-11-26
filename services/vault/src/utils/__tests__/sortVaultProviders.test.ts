import { describe, expect, it } from "vitest";

import type { VaultProviderListItem } from "@/types/vaultProvider";

import {
  findPinnableVaultProvider,
  pinVaultProvider,
  sortVaultProviders,
} from "../sortVaultProviders";

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

describe("pinVaultProvider", () => {
  const first = makeProvider({ id: "0xaaa1", name: "First" });
  const second = makeProvider({ id: "0xbbb2", name: "Second" });
  const third = makeProvider({ id: "0xccc3", name: "Third" });

  it("moves the linked provider to the front and keeps the others in order", () => {
    const pinned = pinVaultProvider([first, second, third], "0xccc3");

    expect(pinned.map((p) => p.id)).toEqual(["0xccc3", "0xaaa1", "0xbbb2"]);
  });

  it("matches the linked provider whatever the letter case", () => {
    const checksummed = makeProvider({ id: "0xCcC3", name: "Checksummed" });

    const pinned = pinVaultProvider([first, checksummed], "0xccc3");

    expect(pinned.map((p) => p.id)).toEqual(["0xCcC3", "0xaaa1"]);
  });

  it("leaves a runtime-unhealthy linked provider in its place", () => {
    const unhealthy = makeProvider({
      id: "0xccc3",
      name: "Unhealthy",
      unhealthy: true,
    });

    const pinned = pinVaultProvider([first, second, unhealthy], "0xccc3");

    expect(pinned.map((p) => p.id)).toEqual(["0xaaa1", "0xbbb2", "0xccc3"]);
  });

  it("leaves a metadata-rejected linked provider in its place", () => {
    const rejected = makeProvider({
      id: "0xccc3",
      name: "Rejected",
      unavailable: true,
    });

    const pinned = pinVaultProvider([first, second, rejected], "0xccc3");

    expect(pinned.map((p) => p.id)).toEqual(["0xaaa1", "0xbbb2", "0xccc3"]);
  });

  it("keeps the order when the link names no listed provider", () => {
    const pinned = pinVaultProvider([first, second], "0xddd4");

    expect(pinned.map((p) => p.id)).toEqual(["0xaaa1", "0xbbb2"]);
  });

  it("keeps the order without a link", () => {
    const pinned = pinVaultProvider([first, second], null);

    expect(pinned.map((p) => p.id)).toEqual(["0xaaa1", "0xbbb2"]);
  });
});

describe("findPinnableVaultProvider", () => {
  it("returns the listed provider with the id the list holds", () => {
    const checksummed = makeProvider({ id: "0xCcC3", name: "Checksummed" });

    expect(findPinnableVaultProvider([checksummed], "0xccc3")?.id).toBe(
      "0xCcC3",
    );
  });

  it("returns nothing for a problematic provider", () => {
    const unhealthy = makeProvider({
      id: "0xccc3",
      name: "Unhealthy",
      unhealthy: true,
    });

    expect(findPinnableVaultProvider([unhealthy], "0xccc3")).toBeUndefined();
  });
});
