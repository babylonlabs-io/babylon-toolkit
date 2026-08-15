/**
 * G3 gate: the standalone tapLeafHash must be byte-equal to bitcoinjs's
 * bip341.tapleafHash (deep import, test-only) across the CompactSize encoding
 * boundary, and reproduce the BIP-341 wallet test vector — two independent
 * oracles for the hash the expected-signature table pins YIELDs against.
 */

import { tapleafHash as bip341TapleafHash } from "bitcoinjs-lib/src/payments/bip341";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { tapLeafHash } from "../tapLeafHash";

const TAPSCRIPT_LEAF_VERSION = 0xc0;

describe("tapLeafHash", () => {
  // 252/253 straddles the 1-byte→3-byte CompactSize boundary — WOTS leaf
  // scripts exceed 252 bytes, so the multi-byte form is load-bearing.
  it.each([[1], [252], [253], [300]])("matches bip341.tapleafHash for a %i-byte script", (length) => {
    const script = Buffer.alloc(length, 0x51);
    expect(tapLeafHash(TAPSCRIPT_LEAF_VERSION, script).toString("hex")).toBe(
      bip341TapleafHash({ output: script, version: TAPSCRIPT_LEAF_VERSION }).toString("hex"),
    );
  });

  it("reproduces the BIP-341 wallet test vector leaf hash", () => {
    // https://github.com/bitcoin/bips/blob/master/bip-0341/wallet-test-vectors.json
    // — first scriptPubKey vector with a script tree (single leaf, version 192).
    const script = Buffer.from("20d85a959b0290bf19bb89ed43c916be835475d013da4b362117393e25a48229b8ac", "hex");
    expect(tapLeafHash(TAPSCRIPT_LEAF_VERSION, script).toString("hex")).toBe(
      "5b75adecf53548f3ec6ad7d78383bf84cc57b55a3127c72b9a2481752dd88b21",
    );
  });
});
