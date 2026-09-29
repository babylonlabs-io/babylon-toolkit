// @vitest-environment node
// The curve library needs Node's typed arrays for these non-DOM checks.

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from "bitcoinjs-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/config");
vi.unmock("@/config/network");

// The four segwit v0 addresses are the BIP-173 examples:
// https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#examples
// BIP-350's valid table also attests bc1qw508...kv8f3t4 and tb1qrp33...q0sl5k7
// with their scriptPubKeys, and adds bc1p0xlxvlh...vqzk5jj0:
// https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki#test-vectors-for-v0-v16-native-segregated-witness-addresses
// The rest are derived, not BIP vectors. tb1p0xlxvlh...vq47zagq is the same
// Taproot key under the tb HRP. The four base58 values are base58check of
// hash160 751e76e8199196d454941c45d1b3a323f1433bd6 under version bytes 0x00,
// 0x6f, 0x05 and 0xc4. The derived values were recorded from bitcoinjs-lib 6.1.7.
const P2PKH_SCRIPT = "0x76a914751e76e8199196d454941c45d1b3a323f1433bd688ac";
const P2SH_SCRIPT = "0xa914751e76e8199196d454941c45d1b3a323f1433bd687";
const SCRIPT_HEX_PREFIXED = "0x0014751e76e8199196d454941c45d1b3a323f1433bd6";
const P2WSH_SCRIPT =
  "0x00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262";
const P2TR_SCRIPT =
  "0x512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const EXPECTED_TESTNET_ADDRESS = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

let btcAddressToScriptPubKeyHex: typeof import("../btc").btcAddressToScriptPubKeyHex;
let scriptPubKeyHexToBtcAddress: typeof import("../btc").scriptPubKeyHexToBtcAddress;

beforeEach(async () => {
  vi.resetModules();
  const { configureBabylonConfig } = await import(
    "../../config/network/runtime"
  );
  configureBabylonConfig({
    btcNetwork: "signet",
    ethChainId: 11155111,
    ethRpcUrl: "https://test.example/eth",
  });
  ({ btcAddressToScriptPubKeyHex, scriptPubKeyHexToBtcAddress } = await import(
    "../btc"
  ));
  // Match the curve setup in the application's main.tsx.
  bitcoin.initEccLib(ecc);
});

afterEach(() => bitcoin.initEccLib(undefined));

describe("scriptPubKeyHexToBtcAddress", () => {
  it("decodes a P2PKH scriptPubKey to its signet address", () => {
    expect(scriptPubKeyHexToBtcAddress(P2PKH_SCRIPT)).toBe(
      "mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r",
    );
  });

  it("decodes a P2SH scriptPubKey to its signet address", () => {
    expect(scriptPubKeyHexToBtcAddress(P2SH_SCRIPT)).toBe(
      "2N3vVYSK5XRgVSGWy21PnsRmBUywSQNdCsf",
    );
  });

  it("decodes a P2WPKH scriptPubKey to its signet address", () => {
    expect(scriptPubKeyHexToBtcAddress(SCRIPT_HEX_PREFIXED)).toBe(
      EXPECTED_TESTNET_ADDRESS,
    );
  });

  it("decodes a P2WSH scriptPubKey to its signet address", () => {
    expect(scriptPubKeyHexToBtcAddress(P2WSH_SCRIPT)).toBe(
      "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7",
    );
  });

  it("decodes a P2TR scriptPubKey to its signet address", () => {
    expect(scriptPubKeyHexToBtcAddress(P2TR_SCRIPT)).toBe(
      "tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47zagq",
    );
  });

  describe("on the configured mainnet network", () => {
    let decode: typeof import("../btc").scriptPubKeyHexToBtcAddress;

    beforeEach(async () => {
      vi.resetModules();
      const { configureBabylonConfig } = await import(
        "../../config/network/runtime"
      );
      configureBabylonConfig({
        btcNetwork: "mainnet",
        ethChainId: 1,
        ethRpcUrl: "https://test.example/eth",
      });
      ({ scriptPubKeyHexToBtcAddress: decode } = await import("../btc"));
    });

    it("decodes a P2PKH scriptPubKey to its mainnet address", () => {
      expect(decode(P2PKH_SCRIPT)).toBe("1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH");
    });

    it("decodes a P2SH scriptPubKey to its mainnet address", () => {
      expect(decode(P2SH_SCRIPT)).toBe("3CNHUhP3uyB9EUtRLsmvFUmvGdjGdkTxJw");
    });

    it("decodes a P2WPKH scriptPubKey to its mainnet address", () => {
      expect(decode(SCRIPT_HEX_PREFIXED)).toBe(
        "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      );
    });

    it("decodes a P2WSH scriptPubKey to its mainnet address", () => {
      expect(decode(P2WSH_SCRIPT)).toBe(
        "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
      );
    });

    it("decodes a P2TR scriptPubKey to its mainnet address", () => {
      expect(decode(P2TR_SCRIPT)).toBe(
        "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
      );
    });
  });

  it("accepts unprefixed hex (no leading 0x)", () => {
    expect(scriptPubKeyHexToBtcAddress(SCRIPT_HEX_PREFIXED.slice(2))).toBe(
      EXPECTED_TESTNET_ADDRESS,
    );
  });

  it("accepts uppercase hex and its prefix", () => {
    expect(scriptPubKeyHexToBtcAddress(SCRIPT_HEX_PREFIXED.toUpperCase())).toBe(
      EXPECTED_TESTNET_ADDRESS,
    );
  });

  it("rejects an odd number of hex digits", () => {
    expect(() => scriptPubKeyHexToBtcAddress("0x001")).toThrow(
      "must be non-empty and even",
    );
  });

  it("rejects a script without a destination address", () => {
    expect(() => scriptPubKeyHexToBtcAddress("0x6a")).toThrow(
      "has no matching Address",
    );
  });

  it("rejects a Taproot output key that is not a valid x-only point", () => {
    expect(scriptPubKeyHexToBtcAddress(P2TR_SCRIPT)).toBe(
      "tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47zagq",
    );
    expect(() =>
      scriptPubKeyHexToBtcAddress(`0x5120${"ff".repeat(32)}`),
    ).toThrow("has no matching Address");
  });

  it("throws on a non-hex string rather than silently returning a fallback", () => {
    expect(() => scriptPubKeyHexToBtcAddress("0xnothex")).toThrow();
  });

  it("throws on an empty script", () => {
    expect(() => scriptPubKeyHexToBtcAddress("0x")).toThrow();
  });

  it("round-trips through btcAddressToScriptPubKeyHex without changing the address", () => {
    expect(
      scriptPubKeyHexToBtcAddress(
        btcAddressToScriptPubKeyHex(EXPECTED_TESTNET_ADDRESS),
      ),
    ).toBe(EXPECTED_TESTNET_ADDRESS);
  });
});
