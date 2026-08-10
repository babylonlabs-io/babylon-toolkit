import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { btcAddressToScriptPubKeyHex } from "../btc/btcUtils";
import { scriptPubKeyHexToBtcAddress } from "../btc/scriptPubKeyAddress";

/**
 * Build the test fixture via bitcoinjs-lib's own payment helper so the script
 * bytes are guaranteed valid.
 *
 * Test config mocks the BTC network as signet (treated as testnet by btcUtils),
 * so the expected address is bech32-encoded with the `tb1` HRP.
 */
const PUBKEY_HASH_BYTES = new Uint8Array([
  0x75, 0x1e, 0x76, 0xe8, 0x19, 0x91, 0x96, 0xd4, 0x54, 0x94, 0x1c, 0x45, 0xd1,
  0xb3, 0xa3, 0x23, 0xf1, 0x43, 0x3b, 0xd6,
]);

const { output, address: EXPECTED_TESTNET_ADDRESS } = bitcoin.payments.p2wpkh({
  hash: Buffer.from(PUBKEY_HASH_BYTES),
  network: bitcoin.networks.testnet,
});

if (!output || !EXPECTED_TESTNET_ADDRESS) {
  throw new Error("Test fixture setup failed: could not derive p2wpkh");
}

const SCRIPT_HEX_PREFIXED = `0x${Buffer.from(output).toString("hex")}`;
const TAPROOT_OUTPUT_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TAPROOT_SCRIPT_HEX = `0x5120${TAPROOT_OUTPUT_KEY}`;
const TAPROOT_TESTNET_ADDRESS =
  "tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47zagq";

const STANDARD_SCRIPT_VECTORS = [
  {
    name: "P2PKH",
    hex: `76a914${Buffer.from(PUBKEY_HASH_BYTES).toString("hex")}88ac`,
  },
  {
    name: "P2SH",
    hex: `a914${Buffer.from(PUBKEY_HASH_BYTES).toString("hex")}87`,
  },
  {
    name: "P2WPKH",
    hex: `0014${Buffer.from(PUBKEY_HASH_BYTES).toString("hex")}`,
  },
  {
    name: "P2WSH",
    hex: `0020${"42".repeat(32)}`,
  },
] as const;

describe("scriptPubKeyHexToBtcAddress", () => {
  it.each(STANDARD_SCRIPT_VECTORS)(
    "matches bitcoinjs-lib for $name",
    ({ hex }) => {
      expect(scriptPubKeyHexToBtcAddress(hex)).toBe(
        bitcoin.address.fromOutputScript(
          Buffer.from(hex, "hex"),
          bitcoin.networks.testnet,
        ),
      );
    },
  );

  it("decodes a P2WPKH scriptPubKey hex back to its testnet address", () => {
    expect(scriptPubKeyHexToBtcAddress(SCRIPT_HEX_PREFIXED)).toBe(
      EXPECTED_TESTNET_ADDRESS,
    );
  });

  it("accepts unprefixed hex (no leading 0x)", () => {
    expect(scriptPubKeyHexToBtcAddress(SCRIPT_HEX_PREFIXED.slice(2))).toBe(
      EXPECTED_TESTNET_ADDRESS,
    );
  });

  it("decodes a P2TR output without requiring the ECC signing library", () => {
    expect(scriptPubKeyHexToBtcAddress(TAPROOT_SCRIPT_HEX)).toBe(
      TAPROOT_TESTNET_ADDRESS,
    );
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
