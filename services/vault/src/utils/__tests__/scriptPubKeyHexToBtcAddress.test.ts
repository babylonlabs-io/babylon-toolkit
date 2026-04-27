import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { scriptPubKeyHexToBtcAddress } from "../btc";

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

describe("scriptPubKeyHexToBtcAddress", () => {
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

  it("throws on a non-hex string rather than silently returning a fallback", () => {
    expect(() => scriptPubKeyHexToBtcAddress("0xnothex")).toThrow();
  });

  it("throws on an empty script", () => {
    expect(() => scriptPubKeyHexToBtcAddress("0x")).toThrow();
  });
});
