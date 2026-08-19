/**
 * The default wallet policy is the routing switch that makes the device sign
 * key-path inputs at all (base `sign_psbt.c:142-148`). Its id becomes the
 * SIGN_PSBT header's wallet_id, so the serialization must match the Python
 * client the firmware tests drive (`ledger-bitcoin==0.4.0`). Oracle values are
 * the same ones the vendored `policy.golden.test.ts` pins.
 */

import { describe, expect, it } from "vitest";

import { DefaultWalletPolicy } from "../vendor/ledger-bitcoin/policy";
import { buildDefaultTaprootPolicy } from "../walletPolicy";

// [f5acc2fd/86'/1'/0']tpub… — the base app's standard BIP-86 testnet key info.
const FINGERPRINT = "f5acc2fd";
const TPUB =
  "tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U";
const ORACLE_ID_HEX = "627535418bc03eeee2b62b3a0254dc0624881f8bc6fc20c4d3b2c1c4fc929893";

describe("buildDefaultTaprootPolicy", () => {
  it("formats the key info as [fingerprint/86'/coin'/account']xpub", () => {
    const policy = buildDefaultTaprootPolicy({
      masterFingerprintHex: FINGERPRINT,
      coinType: 1,
      accountIndex: 0,
      accountXpub: TPUB,
    });
    expect(policy.descriptorTemplate).toBe("tr(@0/**)");
    expect(policy.keyInfo).toBe(`[f5acc2fd/86'/1'/0']${TPUB}`);
  });

  it("derives the oracle wallet id for the standard testnet key", () => {
    const policy = buildDefaultTaprootPolicy({
      masterFingerprintHex: FINGERPRINT,
      coinType: 1,
      accountIndex: 0,
      accountXpub: TPUB,
    });
    expect(policy.walletIdHex).toBe(ORACLE_ID_HEX);
    // Same id the vendored class (the only serializer) produces for these inputs.
    const vendor = new DefaultWalletPolicy(policy.descriptorTemplate, policy.keyInfo);
    expect(vendor.getId().toString("hex")).toBe(ORACLE_ID_HEX);
    expect(vendor.name).toBe("");
  });

  it("rejects a fingerprint that is not 8 lowercase hex chars", () => {
    expect(() =>
      buildDefaultTaprootPolicy({ masterFingerprintHex: "F5ACC2FD", coinType: 1, accountIndex: 0, accountXpub: TPUB }),
    ).toThrow(/masterFingerprintHex/);
  });

  it("rejects a negative account index", () => {
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 1,
        accountIndex: -1,
        accountXpub: TPUB,
      }),
    ).toThrow(/non-negative integers/);
  });

  it("rejects an empty xpub", () => {
    expect(() =>
      buildDefaultTaprootPolicy({ masterFingerprintHex: FINGERPRINT, coinType: 1, accountIndex: 0, accountXpub: "" }),
    ).toThrow(/accountXpub/);
  });
});
