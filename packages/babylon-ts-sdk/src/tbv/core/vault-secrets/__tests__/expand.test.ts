/**
 * Wrapper-contract tests for the WASM-backed expanders re-exported by
 * `tbv/core/vault-secrets`. Pins the public-API contract that ts-sdk callers
 * depend on, plus JS-side golden vectors guarding the vendored binary: any
 * vault-wasm re-pin that drifts these bytes rotates every existing deposit's
 * on-chain-binding secrets (hard fork) and must not ship. The same vectors
 * are pinned Rust-side in vault-wasm `lib.rs` and btc-vault
 * `golden_vectors_pinned`.
 */

import { describe, expect, it } from "vitest";

import {
  expandAuthAnchor,
  expandHashlockSecret,
  expandWotsSeed,
} from "..";

const ROOT_A = new Uint8Array(32).fill(0x11);
const ROOT_B = new Uint8Array(32).fill(0x22);
// Golden-vector root: the fixed [0x42; 32] input vault-wasm pins in lib.rs.
const GOLDEN_ROOT = new Uint8Array(32).fill(0x42);

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("frozen golden vectors (vendored-binary acceptance gate)", () => {
  it("expandAuthAnchor([0x42;32]) is byte-identical to the pinned vector", async () => {
    expect(toHex(await expandAuthAnchor(GOLDEN_ROOT))).toBe(
      "f7bcaadeba9ae8e0cfc4d31d2ea97b1d62cdc69cdf1da14dfa9b6309866b1277",
    );
  });

  it("expandHashlockSecret([0x42;32], 7) is byte-identical to the pinned vector", async () => {
    expect(toHex(await expandHashlockSecret(GOLDEN_ROOT, 7))).toBe(
      "220aeef3939a9dac87d7f01a13e57e46889788c8c26432d1bd39d3d49b14ec91",
    );
  });

  it("expandWotsSeed([0x42;32], 7) is byte-identical to the pinned vector", async () => {
    expect(toHex(await expandWotsSeed(GOLDEN_ROOT, 7))).toBe(
      "a9596ea280666ab1b19eba91f364f5c3dc66c70169e67f4ba5ddd84c77c90745" +
        "e3cc361f7a6ac926b18847087a63a5558a43d8f89884a8d6386a86f5a2d8d847",
    );
  });
});

describe("vault-secrets wrappers (WASM-backed)", () => {
  describe("expandAuthAnchor", () => {
    it("resolves to exactly 32 bytes", async () => {
      const out = await expandAuthAnchor(ROOT_A);
      expect(out.length).toBe(32);
    });

    it("is deterministic for the same root", async () => {
      expect(toHex(await expandAuthAnchor(ROOT_A))).toBe(
        toHex(await expandAuthAnchor(ROOT_A)),
      );
    });

    it("differs across roots", async () => {
      expect(toHex(await expandAuthAnchor(ROOT_A))).not.toBe(
        toHex(await expandAuthAnchor(ROOT_B)),
      );
    });

    it("rejects with an Error instance when root is the wrong length", async () => {
      // The vault-wasm facade normalizes upstream string errors to real JS
      // `Error` objects at the WASM boundary (its upstream_err_to_error).
      // Pin the type and the Rust-side message body so a wrapper that
      // swallows the message or an accidental import swap to a different
      // Rust fn surfaces as a test failure.
      await expect(expandAuthAnchor(new Uint8Array(31))).rejects.toBeInstanceOf(
        Error,
      );
      await expect(expandAuthAnchor(new Uint8Array(31))).rejects.toThrow(
        /root must be exactly 32 bytes, got 31/,
      );
    });
  });

  describe("expandHashlockSecret", () => {
    it("resolves to exactly 32 bytes", async () => {
      const out = await expandHashlockSecret(ROOT_A, 0);
      expect(out.length).toBe(32);
    });

    it("is deterministic for the same (root, htlcVout)", async () => {
      expect(toHex(await expandHashlockSecret(ROOT_A, 3))).toBe(
        toHex(await expandHashlockSecret(ROOT_A, 3)),
      );
    });

    it("differs across htlcVout values (per-vault domain separation)", async () => {
      expect(toHex(await expandHashlockSecret(ROOT_A, 0))).not.toBe(
        toHex(await expandHashlockSecret(ROOT_A, 1)),
      );
    });

    it("rejects with an Error instance when root is the wrong length", async () => {
      await expect(
        expandHashlockSecret(new Uint8Array(31), 0),
      ).rejects.toBeInstanceOf(Error);
      await expect(
        expandHashlockSecret(new Uint8Array(31), 0),
      ).rejects.toThrow(/root must be exactly 32 bytes, got 31/);
    });
  });

  describe("expandWotsSeed", () => {
    it("resolves to exactly 64 bytes", async () => {
      const out = await expandWotsSeed(ROOT_A, 0);
      expect(out.length).toBe(64);
    });

    it("is deterministic for the same (root, htlcVout)", async () => {
      expect(toHex(await expandWotsSeed(ROOT_A, 5))).toBe(
        toHex(await expandWotsSeed(ROOT_A, 5)),
      );
    });

    it("differs across htlcVout values (per-vault domain separation)", async () => {
      expect(toHex(await expandWotsSeed(ROOT_A, 0))).not.toBe(
        toHex(await expandWotsSeed(ROOT_A, 1)),
      );
    });

    it("rejects with an Error instance when root is the wrong length", async () => {
      await expect(
        expandWotsSeed(new Uint8Array(31), 0),
      ).rejects.toBeInstanceOf(Error);
      await expect(expandWotsSeed(new Uint8Array(31), 0)).rejects.toThrow(
        /root must be exactly 32 bytes, got 31/,
      );
    });
  });

  describe("cross-secret independence", () => {
    it("authAnchor / hashlockSecret[0] / wotsSeed[0] are all distinct", async () => {
      const a = toHex(await expandAuthAnchor(ROOT_A));
      const h = toHex(await expandHashlockSecret(ROOT_A, 0));
      const w = toHex(await expandWotsSeed(ROOT_A, 0));
      expect(new Set([a, h, w.slice(0, 64)]).size).toBe(3);
    });
  });
});
