import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";
import { expect, test } from "@playwright/test";

import { Network } from "../../src/core/types";
import { resolveLiveNetwork } from "../../src/core/wallets/btc/appkit/network";
import { ERROR_CODES, WalletError } from "../../src/error";

test.describe("resolveLiveNetwork — gating logic for AppKitBTCProvider.getNetwork", () => {
  test("returns configured network when caipNetworkId is undefined (silent connector)", () => {
    expect(resolveLiveNetwork(undefined, Network.SIGNET)).toBe(Network.SIGNET);
  });

  test("returns the live network when caipNetworkId matches the configured network", () => {
    expect(resolveLiveNetwork(bitcoinSignet.caipNetworkId, Network.SIGNET)).toBe(
      Network.SIGNET,
    );
  });

  test("throws UNSUPPORTED_NETWORK with both networks named when wallet is on a different supported network", () => {
    let caught: unknown;
    try {
      resolveLiveNetwork(bitcoin.caipNetworkId, Network.SIGNET);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletError);
    expect((caught as WalletError).code).toBe(ERROR_CODES.UNSUPPORTED_NETWORK);
    expect((caught as WalletError).message).toContain("expects signet");
    expect((caught as WalletError).message).toContain("wallet is on mainnet");
  });

  test("throws UNSUPPORTED_NETWORK for a caipNetworkId outside the supported set", () => {
    let caught: unknown;
    try {
      resolveLiveNetwork("bip122:000000000933ea01ad0ee984209779ba", Network.SIGNET);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletError);
    expect((caught as WalletError).code).toBe(ERROR_CODES.UNSUPPORTED_NETWORK);
    expect((caught as WalletError).message).toContain(
      "bip122:000000000933ea01ad0ee984209779ba",
    );
  });
});
