/**
 * Unit tests for the Keystone coin_type helpers used to warn when the device's
 * exported coin_type doesn't match the app network (the signet "different BTC
 * public key" footgun).
 */
import { expect, test } from "@playwright/test";

import { Network } from "../../src/core/types";
import { expectedTaprootCoinType, getCoinType } from "../../src/core/wallets/btc/keystone/taprootAccount";

test.describe("expectedTaprootCoinType — coin_type per app network", () => {
  test("mainnet expects coin_type 0", () => {
    expect(expectedTaprootCoinType(Network.MAINNET)).toBe(0);
  });

  test("testnet and signet expect coin_type 1", () => {
    expect(expectedTaprootCoinType(Network.TESTNET)).toBe(1);
    expect(expectedTaprootCoinType(Network.SIGNET)).toBe(1);
  });
});

test.describe("getCoinType — parses coin_type from a derivation path", () => {
  test("reads the coin_type component", () => {
    expect(getCoinType("m/86'/0'/0'")).toBe(0);
    expect(getCoinType("m/86'/1'/0'")).toBe(1);
  });

  test("tolerates the 'h' hardened marker", () => {
    expect(getCoinType("m/86h/1h/0h")).toBe(1);
  });
});
