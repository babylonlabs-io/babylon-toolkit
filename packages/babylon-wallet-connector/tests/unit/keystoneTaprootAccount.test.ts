/**
 * Unit tests for Keystone Taproot account selection. The provider class is not
 * imported here (its module pulls in an SVG asset the unit-test runner can't
 * resolve), so the pure path-parsing selection is pinned directly.
 */
import { expect, test } from "@playwright/test";

import { findTaprootAccount } from "../../src/core/wallets/btc/keystone/taprootAccount";

// Mirrors the observed Keystone export order [84', 49', 44', 86'] — Taproot last,
// proving selection must not rely on a fixed index.
const KEYSTONE_EXPORT_ORDER = [
  { path: "m/84'/0'/0'" },
  { path: "m/49'/0'/0'" },
  { path: "m/44'/0'/0'" },
  { path: "m/86'/0'/0'" },
];

test.describe("findTaprootAccount — selects the BIP86 account by path", () => {
  test("finds the 86' account regardless of its position in the export", () => {
    expect(findTaprootAccount(KEYSTONE_EXPORT_ORDER)?.path).toBe("m/86'/0'/0'");
  });

  test("finds the 86' account when it is first", () => {
    const keys = [{ path: "m/86'/1'/0'" }, { path: "m/84'/1'/0'" }];
    expect(findTaprootAccount(keys)?.path).toBe("m/86'/1'/0'");
  });

  test("matches Taproot for any coin_type (testnet 1')", () => {
    const keys = [{ path: "m/44'/1'/0'" }, { path: "m/86'/1'/0'" }];
    expect(findTaprootAccount(keys)?.path).toBe("m/86'/1'/0'");
  });

  test("tolerates the 'h' hardened marker", () => {
    const keys = [{ path: "m/84h/0h/0h" }, { path: "m/86h/0h/0h" }];
    expect(findTaprootAccount(keys)?.path).toBe("m/86h/0h/0h");
  });

  test("returns undefined when no Taproot account is present", () => {
    const keys = [{ path: "m/84'/0'/0'" }, { path: "m/49'/0'/0'" }];
    expect(findTaprootAccount(keys)).toBeUndefined();
  });

  test("returns undefined for an empty export", () => {
    expect(findTaprootAccount([])).toBeUndefined();
  });
});
