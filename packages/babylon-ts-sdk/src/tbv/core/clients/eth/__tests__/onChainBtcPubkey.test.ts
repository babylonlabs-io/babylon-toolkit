import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { assertOnChainBtcPubkey } from "../onChainBtcPubkey";

const FIELD_DIFFERENTIAL_SEED = 0xa90f72ec;
const FIELD_DIFFERENTIAL_FIXTURE_COUNT = 256;

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(
    hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)),
  );
}

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function seededU32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

describe("assertOnChainBtcPubkey", () => {
  it("matches tiny-secp256k1 x-only point validation across edge vectors", () => {
    const vectors = [
      "00".repeat(32),
      "00".repeat(31) + "01",
      "ff".repeat(32),
      "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2e",
      "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f",
      "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc30",
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

  it("matches tiny-secp256k1 across fixed-seed randomized x-coordinates", () => {
    const next = seededU32(FIELD_DIFFERENTIAL_SEED);
    const oracleOutcomes = new Set<boolean>();

    for (let fixture = 0; fixture < FIELD_DIFFERENTIAL_FIXTURE_COUNT; fixture++) {
      const value = hex(
        Uint8Array.from({ length: 32 }, () => (next() >>> 24) & 0xff),
      );
      const expected = ecc.isXOnlyPoint(bytes(value));
      oracleOutcomes.add(expected);
      const validate = () =>
        assertOnChainBtcPubkey(`0x${value}` as Hex, "test key");
      const message = `seed 0x${FIELD_DIFFERENTIAL_SEED.toString(16)}, fixture ${fixture}`;
      if (expected) {
        expect(validate(), message).toBe(value);
      } else {
        expect(validate, message).toThrow(/not on the secp256k1 curve/);
      }
    }

    expect(oracleOutcomes).toEqual(new Set([false, true]));
  });

  it("accepts every x-coordinate derived from scalars 1..256", () => {
    for (let scalar = 1; scalar <= 256; scalar++) {
      const privateKey = new Uint8Array(32);
      privateKey[31] = scalar & 0xff;
      privateKey[30] = scalar >>> 8;

      const point = ecc.pointFromScalar(privateKey, true);
      expect(point).not.toBeNull();

      const xOnly = hex(point!.slice(1));
      expect(ecc.isXOnlyPoint(bytes(xOnly))).toBe(true);
      expect(assertOnChainBtcPubkey(`0x${xOnly}` as Hex, "test key")).toBe(
        xOnly,
      );
    }
  });
});
