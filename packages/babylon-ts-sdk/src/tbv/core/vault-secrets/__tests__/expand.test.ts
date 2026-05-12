/**
 * Wrapper-contract tests for the WASM-backed expanders re-exported by
 * `tbv/core/vault-secrets`. Pins the public-API contract that ts-sdk callers
 * depend on; the byte-for-byte HKDF golden vectors live Rust-side in
 * btc-vault.
 */

import { describe, expect, it } from "vitest";

import {
  expandAuthAnchor,
  expandHashlockSecret,
  expandWotsSeed,
} from "..";

const ROOT_A = new Uint8Array(32).fill(0x11);
const ROOT_B = new Uint8Array(32).fill(0x22);

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

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
      // Round-3 regression: wasm-bindgen rethrows Rust string errors as
      // bare strings. The wrapper layer normalizes to `Error`. Pin both
      // the type, the function-name prefix, and the Rust-side message
      // body so future regressions (wrapper that swallows the message,
      // one-sided fix, accidental import swap to a different Rust fn)
      // all surface as a test failure.
      await expect(expandAuthAnchor(new Uint8Array(31))).rejects.toBeInstanceOf(
        Error,
      );
      await expect(expandAuthAnchor(new Uint8Array(31))).rejects.toThrow(
        /expandAuthAnchor/,
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
      ).rejects.toThrow(/expandHashlockSecret/);
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
        /expandWotsSeed/,
      );
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
