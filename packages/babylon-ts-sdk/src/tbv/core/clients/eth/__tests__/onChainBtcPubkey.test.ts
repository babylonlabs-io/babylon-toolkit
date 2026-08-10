import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { assertOnChainBtcPubkey } from "../onChainBtcPubkey";

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(
    hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)),
  );
}

describe("assertOnChainBtcPubkey", () => {
  it("matches tiny-secp256k1 x-only point validation across edge vectors", () => {
    const vectors = [
      "00".repeat(32),
      "ff".repeat(32),
      "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f",
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
      ...Array.from({ length: 32 }, (_, index) =>
        index.toString(16).padStart(64, String(index % 10)),
      ),
    ];

    for (const value of vectors) {
      const expected = ecc.isXOnlyPoint(bytes(value));
      const validate = () =>
        assertOnChainBtcPubkey(`0x${value}` as Hex, "test key");
      if (expected) {
        expect(validate()).toBe(value);
      } else {
        expect(validate).toThrow(/not on the secp256k1 curve/);
      }
    }
  });
});
