import { expect, test } from "@playwright/test";

import { Network } from "../../src/core/types";
import { mapOneKeyNetwork } from "../../src/core/wallets/btc/onekey/network";

test.describe("mapOneKeyNetwork — OneKey network string normalization", () => {
  test("maps 'livenet' to MAINNET", () => {
    expect(mapOneKeyNetwork("livenet")).toBe(Network.MAINNET);
  });

  test("maps 'signet' to SIGNET", () => {
    expect(mapOneKeyNetwork("signet")).toBe(Network.SIGNET);
  });

  test("maps 'testnet' to SIGNET (OneKey signet alias — wallet does not yet expose signet natively)", () => {
    expect(mapOneKeyNetwork("testnet")).toBe(Network.SIGNET);
  });

  test("returns null for 'regtest'", () => {
    expect(mapOneKeyNetwork("regtest")).toBeNull();
  });

  test("returns null for the empty string", () => {
    expect(mapOneKeyNetwork("")).toBeNull();
  });

  test("returns null for 'fractalmainnet' (chain not in our supported set)", () => {
    expect(mapOneKeyNetwork("fractalmainnet")).toBeNull();
  });

  test("returns null for an attacker-supplied string like 'livenetX'", () => {
    expect(mapOneKeyNetwork("livenetX")).toBeNull();
  });

  test("returns null for an arbitrary garbage string", () => {
    expect(mapOneKeyNetwork("\x00not-a-network\x00")).toBeNull();
  });

  // Prototype-key regressions — own-property check guards these.
  test("returns null for the prototype key 'constructor'", () => {
    expect(mapOneKeyNetwork("constructor")).toBeNull();
  });

  test("returns null for the prototype key 'toString'", () => {
    expect(mapOneKeyNetwork("toString")).toBeNull();
  });

  test("returns null for the prototype key '__proto__'", () => {
    expect(mapOneKeyNetwork("__proto__")).toBeNull();
  });

  test("returns null for the prototype key 'hasOwnProperty'", () => {
    expect(mapOneKeyNetwork("hasOwnProperty")).toBeNull();
  });

  // Non-string regressions — typeof guard blocks toString coercion.
  test("returns null for an object whose toString() returns a known network", () => {
    const malicious = { toString: () => "livenet" } as unknown as string;
    expect(mapOneKeyNetwork(malicious)).toBeNull();
  });

  test("returns null for null and undefined", () => {
    expect(mapOneKeyNetwork(null as unknown as string)).toBeNull();
    expect(mapOneKeyNetwork(undefined as unknown as string)).toBeNull();
  });

  test("returns null for a number", () => {
    expect(mapOneKeyNetwork(0 as unknown as string)).toBeNull();
  });
});
