/**
 * Tests for the per-purpose derivation helpers — `deriveAuthAnchor`,
 * `deriveHashlockSecret`, and `deriveWotsSeed`. These are thin
 * wrappers around `wallet.deriveContextHash`; the tests verify:
 *
 * - the correct `appName` label is used per helper
 * - the context bytes match the per-Pre-PegIn vs per-vault shape
 * - per-vault secrets vary with `htlcVout`
 * - the WOTS seed concatenates the lo + hi calls in the right order
 * - wallet-side validation rejects non-conforming responses
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it, vi } from "vitest";

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
  WOTS_SEED_HI_APP_NAME,
  WOTS_SEED_LO_APP_NAME,
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
  it("makes two deriveContextHash calls (lo + hi) with the same per-vault context", async () => {
    const wallet = deterministicWallet();
    await deriveWotsSeed(wallet, INPUT, 3);

    expect(wallet.seen).toHaveLength(2);
    const expectedContext = uint8ArrayToHex(buildPerVaultContext(INPUT, 3));
    expect(wallet.seen[0]).toEqual({
      appName: WOTS_SEED_LO_APP_NAME,
      context: expectedContext,
    });
    expect(wallet.seen[1]).toEqual({
      appName: WOTS_SEED_HI_APP_NAME,
      context: expectedContext,
    });
  });

  it("returns a 64-byte seed that concatenates lo || hi in order", async () => {
    const wallet = deterministicWallet();
    const seed = await deriveWotsSeed(wallet, INPUT, 0);
    expect(seed.length).toBe(64);

    // Reconstruct what each call should have returned and verify the
    // seed layout matches lo (first 32) then hi (last 32).
    const loCall = wallet.deriveContextHash.mock.results[0]
      .value as Promise<string>;
    const hiCall = wallet.deriveContextHash.mock.results[1]
      .value as Promise<string>;
    const loHex = await loCall;
    const hiHex = await hiCall;
    expect(uint8ArrayToHex(seed.subarray(0, 32))).toBe(loHex);
    expect(uint8ArrayToHex(seed.subarray(32, 64))).toBe(hiHex);
  });

  it("zeroes both half-buffers on the success path (memory hygiene)", async () => {
    const wallet = deterministicWallet();
    const fillSpy = vi.spyOn(Uint8Array.prototype, "fill");
    try {
      await deriveWotsSeed(wallet, INPUT, 0);
      // Two `.fill(0)` calls on the success path: lo + hi half-buffers.
      // The seed itself is the function's return value and not zeroed
      // here — that's the caller's responsibility.
      const zeroFillCalls = fillSpy.mock.calls.filter(
        (args) => args[0] === 0,
      );
      expect(zeroFillCalls.length).toBeGreaterThanOrEqual(2);
    } finally {
      fillSpy.mockRestore();
    }
  });

  it("zeroes the lo half if the hi derivation throws", async () => {
    const wallet = {
      deriveContextHash: vi
        .fn()
        .mockResolvedValueOnce("ab".repeat(32))
        .mockRejectedValueOnce(new Error("simulated wallet rejection")),
    };
    const fillSpy = vi.spyOn(Uint8Array.prototype, "fill");
    try {
      await expect(deriveWotsSeed(wallet, INPUT, 0)).rejects.toThrow(
        /simulated wallet rejection/,
      );
      // The lo buffer is allocated, the hi call throws, the lo finally
      // must still zero it.
      const zeroFillCalls = fillSpy.mock.calls.filter(
        (args) => args[0] === 0,
      );
      expect(zeroFillCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      fillSpy.mockRestore();
    }
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
