import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";
import { payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { assertPayoutScriptMatchesPopKey } from "../payout-script";

const X_ONLY_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const P2TR_SCRIPT =
  "0x5120da4710964f7852695de2da025290e24af6d8c281de5a0b902b7135fd9fd74d21" as Hex;
const P2WPKH_SCRIPT = "0x0014751e76e8199196d454941c45d1b3a323f1433bd6" as Hex;
const RANDOM_VECTOR_COUNT = 64;

function twoItemWitness(compressedPubkey: string): Hex {
  return `0x02010021${compressedPubkey}`;
}

function randomPrivateKey(index: number): Buffer {
  const privateKey = Buffer.from(
    sha256(Buffer.from(`payout-script-random-vector-${index}`)),
  );
  if (!ecc.isPrivate(privateKey)) {
    throw new Error("Random test vector did not produce a private key");
  }
  return privateKey;
}

describe("assertPayoutScriptMatchesPopKey", () => {
  it("matches BIP-86 scripts from the Bitcoin implementation", () => {
    for (const scalar of [1, 2, 3, 4]) {
      const privateKey = Buffer.alloc(32);
      privateKey[31] = scalar;
      const compressed = ecc.pointFromScalar(privateKey, true);
      if (!compressed) throw new Error("Test scalar did not produce a point");
      const xOnly = Buffer.from(compressed).subarray(1);
      const output = payments.p2tr({ internalPubkey: xOnly }).output;
      if (!output) throw new Error("Bitcoin implementation returned no output");

      expect(
        assertPayoutScriptMatchesPopKey(
          output.toString("hex"),
          xOnly.toString("hex"),
          "0x0100",
        ),
      ).toBe(`0x${output.toString("hex")}`);
    }
  });

  it("matches a compressed P2WPKH key from the PoP witness", () => {
    expect(
      assertPayoutScriptMatchesPopKey(
        P2WPKH_SCRIPT,
        X_ONLY_KEY,
        twoItemWitness(`02${X_ONLY_KEY}`),
      ),
    ).toBe(P2WPKH_SCRIPT);
  });

  it("matches randomized BIP-86 scripts from the Bitcoin implementation", () => {
    for (let index = 0; index < RANDOM_VECTOR_COUNT; index++) {
      const compressed = ecc.pointFromScalar(randomPrivateKey(index), true);
      if (!compressed) throw new Error("Test key did not produce a point");
      const xOnly = Buffer.from(compressed).subarray(1);
      const output = payments.p2tr({ internalPubkey: xOnly }).output;
      if (!output) throw new Error("Bitcoin implementation returned no output");

      expect(
        assertPayoutScriptMatchesPopKey(
          output.toString("hex"),
          xOnly.toString("hex"),
          "0x0100",
        ),
      ).toBe(`0x${output.toString("hex")}`);
    }
  });

  it("matches randomized P2WPKH scripts for both key parities", () => {
    const keyPrefixes = new Set<number>();
    for (let index = 0; index < RANDOM_VECTOR_COUNT; index++) {
      const compressed = ecc.pointFromScalar(randomPrivateKey(index), true);
      if (!compressed) throw new Error("Test key did not produce a point");
      const pubkey = Buffer.from(compressed);
      const xOnly = pubkey.subarray(1);
      const output = payments.p2wpkh({ pubkey }).output;
      if (!output) throw new Error("Bitcoin implementation returned no output");
      keyPrefixes.add(pubkey[0]);

      expect(
        assertPayoutScriptMatchesPopKey(
          output.toString("hex"),
          xOnly.toString("hex"),
          twoItemWitness(pubkey.toString("hex")),
        ),
      ).toBe(`0x${output.toString("hex")}`);
    }
    expect([...keyPrefixes].sort()).toEqual([2, 3]);
  });

  it("rejects a script for another BIP-86 key", () => {
    expect(() =>
      assertPayoutScriptMatchesPopKey(
        "0x5120cafd90c7026f0b6ab98df89490d02732881f2f4b5900856358dddff4679c2ffb",
        X_ONLY_KEY,
        "0x0100",
      ),
    ).toThrow(/does not match/);
  });

  it("rejects the opposite-parity P2WPKH script", () => {
    expect(() =>
      assertPayoutScriptMatchesPopKey(
        P2WPKH_SCRIPT,
        X_ONLY_KEY,
        twoItemWitness(`03${X_ONLY_KEY}`),
      ),
    ).toThrow(/does not match/);
  });

  it("rejects P2WPKH without a compressed key in the PoP", () => {
    expect(() =>
      assertPayoutScriptMatchesPopKey(P2WPKH_SCRIPT, X_ONLY_KEY, "0x0100"),
    ).toThrow(/two-item proof of possession witness/);
  });

  it("rejects unsupported and over-length scripts", () => {
    expect(() =>
      assertPayoutScriptMatchesPopKey("0x51", X_ONLY_KEY, "0x0100"),
    ).toThrow(/does not match/);
    expect(() =>
      assertPayoutScriptMatchesPopKey(
        `0x${"00".repeat(129)}`,
        X_ONLY_KEY,
        "0x0100",
      ),
    ).toThrow(/exceeds 128 bytes/);
  });

  it("rejects a public key that is not on secp256k1", () => {
    expect(() =>
      assertPayoutScriptMatchesPopKey(P2TR_SCRIPT, "00".repeat(32), "0x0100"),
    ).toThrow(/not on the secp256k1 curve/);
  });
});
