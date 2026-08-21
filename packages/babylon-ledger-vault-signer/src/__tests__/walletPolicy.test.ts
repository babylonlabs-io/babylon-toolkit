/**
 * The default wallet policy is the routing switch that makes the device sign
 * key-path inputs at all (base `sign_psbt.c:142-148`). Its id becomes the
 * SIGN_PSBT header's wallet_id, so the serialization must match the Python
 * client the firmware tests drive (`ledger-bitcoin==0.4.0`). Oracle values are
 * the same ones the vendored `policy.golden.test.ts` pins.
 */

import { describe, expect, it } from "vitest";

import { buildDefaultTaprootPolicy } from "../walletPolicy";

// [f5acc2fd/86'/1'/0']tpub… — the base app's standard BIP-86 testnet key info.
const FINGERPRINT = "f5acc2fd";
const TPUB =
  "tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U";
const ORACLE_ID_HEX = "627535418bc03eeee2b62b3a0254dc0624881f8bc6fc20c4d3b2c1c4fc929893";
/** Testnet BIP-32 version bytes — the network the TPUB above belongs to. */
const TESTNET_VERSIONS = { public: 0x043587cf, private: 0x04358394 };

describe("buildDefaultTaprootPolicy", () => {
  it("formats the key info as [fingerprint/86'/coin'/account']xpub", () => {
    const policy = buildDefaultTaprootPolicy({
      masterFingerprintHex: FINGERPRINT,
      coinType: 1,
      accountIndex: 0,
      accountXpub: TPUB,
      bip32Versions: TESTNET_VERSIONS,
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
      bip32Versions: TESTNET_VERSIONS,
    });
    // The pinned oracle is the whole check: re-deriving the id through
    // DefaultWalletPolicy here would just re-run what the function already
    // called, and prove nothing.
    expect(policy.walletIdHex).toBe(ORACLE_ID_HEX);
  });

  it("rejects a fingerprint that is not 8 lowercase hex chars", () => {
    expect(() =>
      buildDefaultTaprootPolicy({ masterFingerprintHex: "F5ACC2FD", coinType: 1, accountIndex: 0, accountXpub: TPUB, bip32Versions: TESTNET_VERSIONS }),
    ).toThrow(/masterFingerprintHex/);
  });

  it("rejects a negative account index", () => {
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 1,
        accountIndex: -1,
        accountXpub: TPUB,
      bip32Versions: TESTNET_VERSIONS,
      }),
    ).toThrow(/non-negative integers/);
  });

  it("accepts the largest index a hardened path component can hold", () => {
    const policy = buildDefaultTaprootPolicy({
      masterFingerprintHex: FINGERPRINT,
      coinType: 0x7fffffff,
      accountIndex: 0x7fffffff,
      accountXpub: TPUB,
      bip32Versions: TESTNET_VERSIONS,
    });
    expect(policy.keyInfo).toBe(`[f5acc2fd/86'/2147483647'/2147483647']${TPUB}`);
  });

  it("rejects an index that would overflow hardened derivation", () => {
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 1,
        accountIndex: 0x80000000,
        accountXpub: TPUB,
      bip32Versions: TESTNET_VERSIONS,
      }),
    ).toThrow(/coinType and accountIndex/);
  });

  it("rejects a coin type that would overflow hardened derivation", () => {
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 0x80000000,
        accountIndex: 0,
        accountXpub: TPUB,
      bip32Versions: TESTNET_VERSIONS,
      }),
    ).toThrow(/coinType and accountIndex/);
  });

  it("rejects an empty xpub", () => {
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 1,
        accountIndex: 0,
        accountXpub: "",
        bip32Versions: TESTNET_VERSIONS,
      }),
    ).toThrow(/accountXpub/);
  });

  it("rejects an xpub that is not a decodable extended key", () => {
    // Key info is serialized with Buffer.from(k, "ascii"), so garbage still
    // yields a well-formed wallet id the device can never match a preimage to.
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 1,
        accountIndex: 0,
        accountXpub: "tpubNOTAREALEXTENDEDKEY",
        bip32Versions: TESTNET_VERSIONS,
      }),
    ).toThrow(/accountXpub/);
  });

  it("rejects an xpub whose version bytes belong to another network", () => {
    const MAINNET_VERSIONS = { public: 0x0488b21e, private: 0x0488ade4 };
    expect(() =>
      buildDefaultTaprootPolicy({
        masterFingerprintHex: FINGERPRINT,
        coinType: 0,
        accountIndex: 0,
        accountXpub: TPUB,
        bip32Versions: MAINNET_VERSIONS,
      }),
    ).toThrow(/accountXpub/);
  });

  it("exposes the key origin the derivation fields must sit under", () => {
    const policy = buildDefaultTaprootPolicy({
      masterFingerprintHex: FINGERPRINT,
      coinType: 1,
      accountIndex: 0,
      accountXpub: TPUB,
      bip32Versions: TESTNET_VERSIONS,
    });
    expect(policy.keyOriginPath).toEqual([0x80000000 + 86, 0x80000000 + 1, 0x80000000]);
    expect(policy.accountXpub).toBe(TPUB);
    expect(policy.masterFingerprintHex).toBe(FINGERPRINT);
  });
});
