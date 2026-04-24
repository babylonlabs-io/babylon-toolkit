/**
 * Tests for `vaultContext` encoding per
 * `derive-vault-secrets.md` §2.3 + §4 Vector 3.
 */

import { describe, expect, it } from "vitest";

import { sha256 } from "@noble/hashes/sha2.js";

import {
  buildFundingOutpointsCommitment,
  buildVaultContext,
  type FundingOutpoint,
} from "../context";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const txid = (pattern: number) => new Uint8Array(32).fill(pattern);

describe("buildFundingOutpointsCommitment", () => {
  it("is invariant under input order (canonical lex sort)", () => {
    const a: FundingOutpoint = { txid: txid(0xaa), vout: 0 };
    const b: FundingOutpoint = { txid: txid(0xbb), vout: 1 };
    const c: FundingOutpoint = { txid: txid(0xcc), vout: 2 };

    const forward = buildFundingOutpointsCommitment([a, b, c]);
    const reverse = buildFundingOutpointsCommitment([c, b, a]);
    const shuffled = buildFundingOutpointsCommitment([b, a, c]);

    expect(toHex(forward)).toBe(toHex(reverse));
    expect(toHex(forward)).toBe(toHex(shuffled));
  });

  it("rejects empty outpoints", () => {
    expect(() => buildFundingOutpointsCommitment([])).toThrow(/non-empty/);
  });

  it("rejects duplicate outpoints", () => {
    const o: FundingOutpoint = { txid: txid(0xaa), vout: 0 };
    expect(() => buildFundingOutpointsCommitment([o, o])).toThrow(/duplicate/);
  });

  it("treats same txid with different vout as distinct", () => {
    const a: FundingOutpoint = { txid: txid(0xaa), vout: 0 };
    const b: FundingOutpoint = { txid: txid(0xaa), vout: 1 };
    expect(() => buildFundingOutpointsCommitment([a, b])).not.toThrow();
  });

  it("rejects txid of wrong length", () => {
    expect(() =>
      buildFundingOutpointsCommitment([{ txid: new Uint8Array(31), vout: 0 }]),
    ).toThrow(/32 bytes/);
  });

  it("rejects non-u32 vout", () => {
    expect(() =>
      buildFundingOutpointsCommitment([{ txid: txid(0xaa), vout: -1 }]),
    ).toThrow(/u32/);
    expect(() =>
      buildFundingOutpointsCommitment([
        { txid: txid(0xaa), vout: 0x1_0000_0000 },
      ]),
    ).toThrow(/u32/);
  });

  it("matches manual SHA-256 over sorted concatenation (golden Vector 3 inputs)", () => {
    // Vector 3 inputs from derive-vault-secrets.md §4:
    // outpoint_a: txid = 0xaa..aa, vout = 0x00000000
    // outpoint_b: txid = 0xbb..bb, vout = 0x00000001
    // Sorted order: a before b (0xaa < 0xbb in the first byte).
    const a = new Uint8Array(36);
    a.fill(0xaa, 0, 32);
    // vout = 0 — bytes 32..35 already zero.
    const b = new Uint8Array(36);
    b.fill(0xbb, 0, 32);
    b[35] = 0x01; // vout = 1 big-endian

    const flat = new Uint8Array(72);
    flat.set(a, 0);
    flat.set(b, 36);
    const expected = sha256(flat);

    const actual = buildFundingOutpointsCommitment([
      { txid: txid(0xaa), vout: 0 },
      { txid: txid(0xbb), vout: 1 },
    ]);
    expect(toHex(actual)).toBe(toHex(expected));
  });
});

describe("buildVaultContext", () => {
  it("produces a 72-byte output", () => {
    const ctx = buildVaultContext({
      depositorBtcPubkey: new Uint8Array(32).fill(0x01),
      fundingOutpoints: [{ txid: txid(0xaa), vout: 0 }],
    });
    expect(ctx.length).toBe(72);
  });

  it("matches the §4 Vector 3 layout", () => {
    // vaultContext :=
    //    I2OSP(32, 4) || depositorBtcPubkey
    // || I2OSP(32, 4) || fundingOutpointsCommitment
    const depositorBtcPubkey = new Uint8Array(32).fill(0x01);
    const commitment = buildFundingOutpointsCommitment([
      { txid: txid(0xaa), vout: 0 },
      { txid: txid(0xbb), vout: 1 },
    ]);

    const ctx = buildVaultContext({
      depositorBtcPubkey,
      fundingOutpoints: [
        { txid: txid(0xaa), vout: 0 },
        { txid: txid(0xbb), vout: 1 },
      ],
    });

    // First 4 bytes: length prefix 32 (big-endian)
    expect(toHex(ctx.slice(0, 4))).toBe("00000020");
    // Next 32 bytes: depositor pubkey
    expect(toHex(ctx.slice(4, 36))).toBe(toHex(depositorBtcPubkey));
    // Next 4 bytes: length prefix 32
    expect(toHex(ctx.slice(36, 40))).toBe("00000020");
    // Last 32 bytes: commitment
    expect(toHex(ctx.slice(40, 72))).toBe(toHex(commitment));
  });

  it("rejects a depositor pubkey of wrong length", () => {
    expect(() =>
      buildVaultContext({
        depositorBtcPubkey: new Uint8Array(33),
        fundingOutpoints: [{ txid: txid(0xaa), vout: 0 }],
      }),
    ).toThrow(/32 bytes/);
  });

  it("propagates duplicate-outpoint errors from the commitment", () => {
    const o: FundingOutpoint = { txid: txid(0xaa), vout: 0 };
    expect(() =>
      buildVaultContext({
        depositorBtcPubkey: new Uint8Array(32),
        fundingOutpoints: [o, o],
      }),
    ).toThrow(/duplicate/);
  });

  it("is invariant under outpoint input order", () => {
    const a: FundingOutpoint = { txid: txid(0xaa), vout: 0 };
    const b: FundingOutpoint = { txid: txid(0xbb), vout: 1 };
    const depositorBtcPubkey = new Uint8Array(32).fill(0x77);

    const ctx1 = buildVaultContext({
      depositorBtcPubkey,
      fundingOutpoints: [a, b],
    });
    const ctx2 = buildVaultContext({
      depositorBtcPubkey,
      fundingOutpoints: [b, a],
    });
    expect(toHex(ctx1)).toBe(toHex(ctx2));
  });
});
