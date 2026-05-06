import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";
import { expect, test } from "@playwright/test";

import { Network } from "../../src/core/types";
import { caipNetworkIdToNetwork } from "../../src/core/wallets/btc/appkit/network";

test.describe("caipNetworkIdToNetwork — AppKit BTC network normalization", () => {
  test("maps bitcoin.caipNetworkId to MAINNET", () => {
    expect(caipNetworkIdToNetwork(bitcoin.caipNetworkId)).toBe(Network.MAINNET);
  });

  test("maps bitcoinSignet.caipNetworkId to SIGNET", () => {
    expect(caipNetworkIdToNetwork(bitcoinSignet.caipNetworkId)).toBe(
      Network.SIGNET,
    );
  });

  test("returns null for an unrelated bip122 caipNetworkId (e.g. testnet)", () => {
    // Bitcoin testnet3 genesis hash, not in our supported set
    expect(
      caipNetworkIdToNetwork("bip122:000000000933ea01ad0ee984209779ba"),
    ).toBeNull();
  });

  test("returns null for the empty string", () => {
    expect(caipNetworkIdToNetwork("")).toBeNull();
  });

  test("returns null when caipNetworkId is undefined", () => {
    expect(caipNetworkIdToNetwork(undefined)).toBeNull();
  });

  test("returns null for an attacker-supplied / garbage string", () => {
    expect(caipNetworkIdToNetwork("evil:0xdeadbeef")).toBeNull();
    expect(caipNetworkIdToNetwork("bip122:livenetX")).toBeNull();
  });

  test("returns null for a fractal mainnet caipNetworkId (chain not in our supported set)", () => {
    expect(
      caipNetworkIdToNetwork("bip122:fractalmainnet-placeholder-id"),
    ).toBeNull();
  });
});
