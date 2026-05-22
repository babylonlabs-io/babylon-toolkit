import { expect, test } from "@playwright/test";

import { isForeignBtcProvider } from "../../src/core/wallets/btc/unisat/conflict";

test.describe("isForeignBtcProvider — detects a non-Unisat extension shadowing window.unisat", () => {
  test("returns false for a genuine Unisat provider (no foreign markers)", () => {
    expect(isForeignBtcProvider({ requestAccounts: () => {}, getChain: () => {} })).toBe(false);
  });

  test("returns true for an OKX provider (isOkxWallet)", () => {
    expect(isForeignBtcProvider({ isOkxWallet: true })).toBe(true);
  });

  test("returns true for a Bitget provider (isBitget)", () => {
    expect(isForeignBtcProvider({ isBitget: true })).toBe(true);
  });

  test("returns true for a legacy Bitget/BitKeep provider (isBitKeep)", () => {
    expect(isForeignBtcProvider({ isBitKeep: true })).toBe(true);
  });

  test("returns true for a OneKey provider (isOneKey)", () => {
    expect(isForeignBtcProvider({ isOneKey: true })).toBe(true);
  });

  test("returns true for a TokenPocket provider (isTokenPocket)", () => {
    expect(isForeignBtcProvider({ isTokenPocket: true })).toBe(true);
  });

  test("returns false for null", () => {
    expect(isForeignBtcProvider(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isForeignBtcProvider(undefined)).toBe(false);
  });

  test("returns false for a non-object value (string)", () => {
    expect(isForeignBtcProvider("unisat")).toBe(false);
  });

  // A marker present but not strictly `true` is not a reliable conflict signal —
  // genuine Unisat could expose a same-named field with a different value.
  test("treats a marker set to a non-true value as not a conflict", () => {
    expect(isForeignBtcProvider({ isOkxWallet: false })).toBe(false);
    expect(isForeignBtcProvider({ isOkxWallet: "yes" })).toBe(false);
  });

  // Only own properties count — guards against a marker leaking via the prototype.
  test("ignores inherited marker properties (own-property only)", () => {
    const inherited = Object.create({ isOkxWallet: true });
    expect(isForeignBtcProvider(inherited)).toBe(false);
  });
});
