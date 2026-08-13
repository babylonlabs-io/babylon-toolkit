/**
 * Mainnet counterpart to `scriptPubKeyHexToBtcAddress.test.ts`.
 *
 * The global test setup mocks `@/config/network` as signet, so the `bc` HRP and
 * the 0x00/0x05 base58 version bytes never execute there — yet that is exactly
 * what a real depositor sees as their payout destination. `vi.mock` is
 * module-scoped and hoisted, so the mainnet override needs its own file.
 */

import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/network", () => ({
  getBTCNetwork: () => "mainnet",
  BTC_MAINNET: "mainnet",
}));

import { scriptPubKeyHexToBtcAddress } from "../btc/scriptPubKeyAddress";

const PUBKEY_HASH_HEX = "751e76e8199196d454941c45d1b3a323f1433bd6";

const STANDARD_SCRIPT_VECTORS = [
  { name: "P2PKH", hex: `76a914${PUBKEY_HASH_HEX}88ac` },
  { name: "P2SH", hex: `a914${PUBKEY_HASH_HEX}87` },
  { name: "P2WPKH", hex: `0014${PUBKEY_HASH_HEX}` },
  { name: "P2WSH", hex: `0020${"42".repeat(32)}` },
] as const;

// bitcoinjs-lib's `fromOutputScript` throws on a v1 witness program without an
// initialized ECC implementation, so the taproot expectation is a fixed vector
// (as in the signet suite) rather than a differential comparison.
const TAPROOT_OUTPUT_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TAPROOT_MAINNET_ADDRESS =
  "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0";

describe("scriptPubKeyHexToBtcAddress on mainnet", () => {
  it.each(STANDARD_SCRIPT_VECTORS)(
    "matches bitcoinjs-lib for $name",
    ({ hex }) => {
      expect(scriptPubKeyHexToBtcAddress(hex)).toBe(
        bitcoin.address.fromOutputScript(
          Buffer.from(hex, "hex"),
          bitcoin.networks.bitcoin,
        ),
      );
    },
  );

  it("decodes a P2TR output to a bc1p address without the ECC signing library", () => {
    expect(scriptPubKeyHexToBtcAddress(`0x5120${TAPROOT_OUTPUT_KEY}`)).toBe(
      TAPROOT_MAINNET_ADDRESS,
    );
  });
});
