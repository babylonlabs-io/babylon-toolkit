/**
 * Tests for HKDF-Expand-based vault-secret derivation
 * (`derive-vault-secrets.md` §2.2).
 *
 * Covers output sizes, determinism, cross-independence, input
 * validation, and reference equivalence with a direct
 * `@noble/hashes/hkdf` expand call.
 */

import { describe, expect, it } from "vitest";

import { expand as hkdfExpand } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import {
  expandAuthAnchor,
  expandHashlockSecret,
  expandWotsSeed,
} from "../expand";
import {
  LABEL_AUTH_ANCHOR,
  LABEL_HASHLOCK,
  LABEL_WOTS_SEED,
  buildInfo,
  i2osp4,
} from "../info";

const ROOT_A = new Uint8Array(32).fill(0x11);
const ROOT_B = new Uint8Array(32).fill(0x22);

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("expandAuthAnchor", () => {
  it("returns exactly 32 bytes", () => {
    expect(expandAuthAnchor(ROOT_A).length).toBe(32);
  });

  it("is deterministic for the same root", () => {
    expect(toHex(expandAuthAnchor(ROOT_A))).toBe(
      toHex(expandAuthAnchor(ROOT_A)),
    );
  });

  it("differs across roots", () => {
    expect(toHex(expandAuthAnchor(ROOT_A))).not.toBe(
      toHex(expandAuthAnchor(ROOT_B)),
    );
  });

  it("matches a direct HKDF-Expand reference computation", () => {
    const reference = hkdfExpand(
      sha256,
      ROOT_A,
      buildInfo(LABEL_AUTH_ANCHOR),
      32,
    );
    expect(toHex(expandAuthAnchor(ROOT_A))).toBe(toHex(reference));
  });

  it("rejects a root of wrong length", () => {
    expect(() => expandAuthAnchor(new Uint8Array(31))).toThrow(/32 bytes/);
    expect(() => expandAuthAnchor(new Uint8Array(33))).toThrow(/32 bytes/);
  });
});

describe("expandHashlockSecret", () => {
  it("returns exactly 32 bytes", () => {
    expect(expandHashlockSecret(ROOT_A, 0).length).toBe(32);
  });

  it("is deterministic for the same (root, htlcVout)", () => {
    expect(toHex(expandHashlockSecret(ROOT_A, 3))).toBe(
      toHex(expandHashlockSecret(ROOT_A, 3)),
    );
  });

  it("differs across htlcVout values", () => {
    expect(toHex(expandHashlockSecret(ROOT_A, 0))).not.toBe(
      toHex(expandHashlockSecret(ROOT_A, 1)),
    );
  });

  it("differs from expandAuthAnchor even at htlcVout = 0", () => {
    expect(toHex(expandHashlockSecret(ROOT_A, 0))).not.toBe(
      toHex(expandAuthAnchor(ROOT_A)),
    );
  });

  it("matches a direct HKDF-Expand reference computation", () => {
    const reference = hkdfExpand(
      sha256,
      ROOT_A,
      buildInfo(LABEL_HASHLOCK, i2osp4(7)),
      32,
    );
    expect(toHex(expandHashlockSecret(ROOT_A, 7))).toBe(toHex(reference));
  });

  it("rejects a root of wrong length", () => {
    expect(() => expandHashlockSecret(new Uint8Array(31), 0)).toThrow(
      /32 bytes/,
    );
  });
});

describe("expandWotsSeed", () => {
  it("returns exactly 64 bytes", () => {
    expect(expandWotsSeed(ROOT_A, 0).length).toBe(64);
  });

  it("is deterministic for the same (root, htlcVout)", () => {
    expect(toHex(expandWotsSeed(ROOT_A, 5))).toBe(
      toHex(expandWotsSeed(ROOT_A, 5)),
    );
  });

  it("differs across htlcVout values", () => {
    expect(toHex(expandWotsSeed(ROOT_A, 0))).not.toBe(
      toHex(expandWotsSeed(ROOT_A, 1)),
    );
  });

  it("differs from hashlockSecret and authAnchor at htlcVout = 0", () => {
    const w = toHex(expandWotsSeed(ROOT_A, 0));
    // wotsSeed is 64 bytes; truncate for a byte-prefix comparison —
    // the first 32 bytes of wots must still differ from the 32-byte
    // siblings since HKDF outputs are domain-separated.
    expect(w.slice(0, 64)).not.toBe(toHex(expandHashlockSecret(ROOT_A, 0)));
    expect(w.slice(0, 64)).not.toBe(toHex(expandAuthAnchor(ROOT_A)));
  });

  it("matches a direct HKDF-Expand reference computation", () => {
    const reference = hkdfExpand(
      sha256,
      ROOT_A,
      buildInfo(LABEL_WOTS_SEED, i2osp4(42)),
      64,
    );
    expect(toHex(expandWotsSeed(ROOT_A, 42))).toBe(toHex(reference));
  });
});

describe("cross-child independence in a batch", () => {
  // Spec §4 Vector 2 "critical batch test": for htlcVouts [0, 1, 2],
  // the three hashlockSecret values and three wotsSeed values MUST be
  // pairwise distinct, and authAnchor MUST be the same value
  // regardless of which HTLC is being processed.

  const vouts = [0, 1, 2] as const;

  it("authAnchor is shared across all HTLCs in a batch", () => {
    const a = expandAuthAnchor(ROOT_A);
    for (const v of vouts) {
      // Auth anchor doesn't take htlcVout, but the invariant is that
      // it's the same across all vault-context consumers in a batch.
      expect(toHex(a)).toBe(toHex(expandAuthAnchor(ROOT_A)));
      // Cross-check: hashlockSecret[v] != authAnchor.
      expect(toHex(expandHashlockSecret(ROOT_A, v))).not.toBe(toHex(a));
    }
  });

  it("hashlockSecret[0..2] are pairwise distinct", () => {
    const secrets = vouts.map((v) => toHex(expandHashlockSecret(ROOT_A, v)));
    expect(new Set(secrets).size).toBe(vouts.length);
  });

  it("wotsSeed[0..2] are pairwise distinct", () => {
    const seeds = vouts.map((v) => toHex(expandWotsSeed(ROOT_A, v)));
    expect(new Set(seeds).size).toBe(vouts.length);
  });
});
