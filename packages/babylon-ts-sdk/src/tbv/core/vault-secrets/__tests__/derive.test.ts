/**
 * Tests for the per-purpose derivation helpers — `deriveAuthAnchor`,
 * `deriveHashlockSecret`, and `deriveWotsSeed`. These are thin
 * wrappers around `wallet.deriveContextHash`; the tests verify:
 *
 * - the correct `appName` label is used per helper
 * - the context bytes match the per-Pre-PegIn vs per-vault shape
 * - per-vault secrets vary with `htlcVout`
 * - the WOTS seed is HKDF-Expand-SHA-256 over the wallet's 32-byte
 *   output with a fixed info string, pinned against drift
 * - wallet-side validation rejects non-conforming responses
 */

import { expand as hkdfExpand } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it, vi } from "vitest";

// Wrap @noble/hashes/hkdf.js so that the real `expand` runs (the
// pinned-vector test depends on real HKDF output) but the call is
// observable via `vi.mocked(hkdfExpand).mock.calls` for the
// memory-zeroing test.
vi.mock("@noble/hashes/hkdf.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@noble/hashes/hkdf.js")>();
  return { ...actual, expand: vi.fn(actual.expand) };
});

import { uint8ArrayToHex } from "../../primitives/utils/bitcoin";
import {
  buildPerVaultContext,
  buildVaultContext,
  type FundingOutpoint,
  type VaultContextInput,
} from "../context";
import {
  AUTH_ANCHOR_APP_NAME,
  deriveAuthAnchor,
} from "../deriveAuthAnchor";
import {
  HASHLOCK_APP_NAME,
  deriveHashlockSecret,
} from "../deriveHashlockSecret";
import {
  WOTS_SEED_APP_NAME,
  deriveWotsSeed,
} from "../deriveWotsSeed";

const txid = (pattern: number) => new Uint8Array(32).fill(pattern);

const INPUT: VaultContextInput = {
  depositorBtcPubkey: new Uint8Array(32).fill(0xaa),
  fundingOutpoints: [
    { txid: txid(0x11), vout: 0 } satisfies FundingOutpoint,
    { txid: txid(0x22), vout: 1 } satisfies FundingOutpoint,
  ],
};

/** Wallet that returns a deterministic value derived from (appName, context). */
function deterministicWallet() {
  const seen: Array<{ appName: string; context: string }> = [];
  return {
    seen,
    deriveContextHash: vi.fn(async (appName: string, context: string) => {
      seen.push({ appName, context });
      const enc = new TextEncoder();
      return uint8ArrayToHex(sha256(enc.encode(`${appName}:${context}`)));
    }),
  };
}

describe("deriveAuthAnchor", () => {
  it("calls deriveContextHash with the auth label and per-Pre-PegIn context", async () => {
    const wallet = deterministicWallet();
    await deriveAuthAnchor(wallet, INPUT);

    expect(wallet.seen).toHaveLength(1);
    expect(wallet.seen[0].appName).toBe(AUTH_ANCHOR_APP_NAME);
    expect(wallet.seen[0].context).toBe(uint8ArrayToHex(buildVaultContext(INPUT)));
  });

  it("returns the wallet output verbatim (32 bytes)", async () => {
    const wallet = deterministicWallet();
    const result = await deriveAuthAnchor(wallet, INPUT);
    expect(result.length).toBe(32);
  });
});

describe("deriveHashlockSecret", () => {
  it("calls deriveContextHash with the hashlock label and per-vault context", async () => {
    const wallet = deterministicWallet();
    await deriveHashlockSecret(wallet, INPUT, 7);

    expect(wallet.seen).toHaveLength(1);
    expect(wallet.seen[0].appName).toBe(HASHLOCK_APP_NAME);
    expect(wallet.seen[0].context).toBe(
      uint8ArrayToHex(buildPerVaultContext(INPUT, 7)),
    );
  });

  it("produces distinct secrets for different htlcVout values", async () => {
    const wallet = deterministicWallet();
    const a = await deriveHashlockSecret(wallet, INPUT, 0);
    const b = await deriveHashlockSecret(wallet, INPUT, 1);
    expect(uint8ArrayToHex(a)).not.toBe(uint8ArrayToHex(b));
  });
});

describe("deriveWotsSeed", () => {
  it("makes one deriveContextHash call with the WOTS label and per-vault context", async () => {
    const wallet = deterministicWallet();
    await deriveWotsSeed(wallet, INPUT, 3);

    expect(wallet.seen).toHaveLength(1);
    expect(wallet.seen[0]).toEqual({
      appName: WOTS_SEED_APP_NAME,
      context: uint8ArrayToHex(buildPerVaultContext(INPUT, 3)),
    });
  });

  it("returns a 64-byte seed", async () => {
    const wallet = deterministicWallet();
    const seed = await deriveWotsSeed(wallet, INPUT, 0);
    expect(seed.length).toBe(64);
  });

  it("HKDF-expands the 32-byte wallet output rather than returning it verbatim", async () => {
    // The seed is HKDF-Expand of a 32-byte PRK with a fixed info
    // string. The first 32 bytes of the seed must NOT equal the raw
    // wallet output — that would mean expansion was a no-op.
    const knownRoot = new Uint8Array(32).fill(0xab);
    const wallet = {
      deriveContextHash: vi.fn(async () => uint8ArrayToHex(knownRoot)),
    };
    const seed = await deriveWotsSeed(wallet, INPUT, 0);
    expect(uint8ArrayToHex(seed.subarray(0, 32))).not.toBe(
      uint8ArrayToHex(knownRoot),
    );
  });

  it("produces distinct seeds for different htlcVout values", async () => {
    const wallet = deterministicWallet();
    const a = await deriveWotsSeed(wallet, INPUT, 0);
    const b = await deriveWotsSeed(wallet, INPUT, 1);
    expect(uint8ArrayToHex(a)).not.toBe(uint8ArrayToHex(b));
  });

  it("matches a pinned HKDF-Expand vector for a known wallet output (catches info-string drift)", async () => {
    // If the wallet returns 0xaa repeated 32 times, HKDF-Expand-SHA-256
    // (PRK = wallet output, info = "babylon-btc-vault-wots-seed",
    // L=64) must produce this exact 64-byte hex. Any change to the
    // info string, hash function, expansion length, or a switch back
    // to full HKDF (Extract+Expand) breaks this.
    const knownRoot = new Uint8Array(32).fill(0xaa);
    const wallet = {
      deriveContextHash: vi.fn(async () => uint8ArrayToHex(knownRoot)),
    };
    const seed = await deriveWotsSeed(wallet, INPUT, 0);
    expect(uint8ArrayToHex(seed)).toBe(
      "3223c445424c9f5cfe601c31482d28a8962465356f42193d5bc6b342e87c4516" +
        "d66e00ef3e3bb8473b415268869906c44d9801feb6925a83eef100d2f75e388b",
    );
  });

  it("zeroes the 32-byte root buffer after expansion (memory hygiene)", async () => {
    // Capture the exact PRK Uint8Array the helper allocated via the
    // wrapped HKDF-Expand call. That buffer must be all-zero by the
    // time the helper returns.
    vi.mocked(hkdfExpand).mockClear();
    const knownRoot = new Uint8Array(32).fill(0xab);
    const wallet = {
      deriveContextHash: vi.fn(async () => uint8ArrayToHex(knownRoot)),
    };
    await deriveWotsSeed(wallet, INPUT, 0);

    const calls = vi.mocked(hkdfExpand).mock.calls;
    expect(calls.length).toBe(1);
    const prk = calls[0][1] as Uint8Array;
    expect(prk).toBeInstanceOf(Uint8Array);
    expect(prk.length).toBe(32);
    expect(Array.from(prk)).toEqual(new Array(32).fill(0));
  });
});

describe("wallet response validation", () => {
  it("rejects a non-string response", async () => {
    const wallet = {
      deriveContextHash: vi.fn(async () => 123 as unknown as string),
    };
    await expect(deriveAuthAnchor(wallet, INPUT)).rejects.toThrow(
      /must return a string/,
    );
  });

  it("rejects a wrong-length response", async () => {
    const wallet = {
      deriveContextHash: vi.fn(async () => "ab".repeat(31)),
    };
    await expect(deriveAuthAnchor(wallet, INPUT)).rejects.toThrow(
      /must return a 64-character/,
    );
  });

  it("rejects uppercase hex", async () => {
    const wallet = {
      deriveContextHash: vi.fn(async () => "AB".repeat(32)),
    };
    await expect(deriveAuthAnchor(wallet, INPUT)).rejects.toThrow(
      /lowercase hex/,
    );
  });
});
