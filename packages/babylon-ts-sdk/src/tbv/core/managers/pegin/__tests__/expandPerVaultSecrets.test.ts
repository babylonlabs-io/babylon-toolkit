import { describe, expect, it, vi } from "vitest";

import * as wots from "../../../wots";
import { expandPerVaultSecrets } from "../expandPerVaultSecrets";

function freshRoot(byte = 0xab): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

describe("expandPerVaultSecrets", () => {
  it("returns one entry per vault across all four output arrays", async () => {
    const root = freshRoot();
    const result = await expandPerVaultSecrets(root, 3);

    expect(result.perVaultWotsKeys).toHaveLength(3);
    expect(result.wotsPkHashes).toHaveLength(3);
    expect(result.htlcSecretHexes).toHaveLength(3);
    expect(result.hashlocks).toHaveLength(3);
  });

  it("emits per-vault HTLC secrets in the canonical hex shape (no 0x, lowercase, 64 chars)", async () => {
    const root = freshRoot();
    const result = await expandPerVaultSecrets(root, 2);

    for (const secretHex of result.htlcSecretHexes) {
      expect(secretHex).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const hashlock of result.hashlocks) {
      expect(hashlock).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const wotsHash of result.wotsPkHashes) {
      expect(wotsHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("produces distinct secrets across vaults via HKDF htlcVout domain separation", async () => {
    // Same root, different htlcVout → different secrets. This pins the
    // per-vault domain separation that prevents one vault's HTLC from
    // unlocking another's, even when they share a Pre-PegIn.
    const root = freshRoot();
    const result = await expandPerVaultSecrets(root, 3);

    const unique = new Set(result.htlcSecretHexes);
    expect(unique.size).toBe(3);

    const uniqueHashlocks = new Set(result.hashlocks);
    expect(uniqueHashlocks.size).toBe(3);

    const uniqueWots = new Set(result.wotsPkHashes);
    expect(uniqueWots.size).toBe(3);
  });

  it("is deterministic for the same root and vault count", async () => {
    const a = await expandPerVaultSecrets(freshRoot(0x42), 2);
    const b = await expandPerVaultSecrets(freshRoot(0x42), 2);
    expect(a.htlcSecretHexes).toEqual(b.htlcSecretHexes);
    expect(a.hashlocks).toEqual(b.hashlocks);
    expect(a.wotsPkHashes).toEqual(b.wotsPkHashes);
  });

  it("yields different secrets for different roots", async () => {
    const a = await expandPerVaultSecrets(freshRoot(0x01), 1);
    const b = await expandPerVaultSecrets(freshRoot(0x02), 1);
    expect(a.htlcSecretHexes).not.toEqual(b.htlcSecretHexes);
  });

  it("zeros the root buffer after a successful expansion", async () => {
    const root = freshRoot(0x77);
    await expandPerVaultSecrets(root, 1);
    expect(root.every((b) => b === 0)).toBe(true);
  });

  it("zeros the root even if an inner expansion throws", async () => {
    // Memory-hygiene contract: the helper takes ownership of `root`
    // and must wipe it on every exit path, including when one of the
    // dependencies (`deriveWotsBlocksFromSeed` here) fails mid-loop.
    // Without the outer `try/finally` this would leak a live root
    // into long-lived memory whenever HKDF/keccak/wots derivation
    // hits an error.
    const spy = vi
      .spyOn(wots, "deriveWotsBlocksFromSeed")
      .mockRejectedValueOnce(new Error("simulated wots failure"));

    const root = freshRoot(0x55);
    await expect(expandPerVaultSecrets(root, 2)).rejects.toThrow(
      /simulated wots failure/,
    );
    expect(root.every((b) => b === 0)).toBe(true);

    spy.mockRestore();
  });

  it("returns empty arrays for vaultCount = 0 (no expansion, root still zeroed)", async () => {
    // Defensive: callers (PeginManager) reject zero vaults upstream,
    // but the helper itself should not blow up — it must still wipe
    // the root rather than leaving it live.
    const root = freshRoot(0x33);
    const result = await expandPerVaultSecrets(root, 0);
    expect(result.htlcSecretHexes).toEqual([]);
    expect(result.hashlocks).toEqual([]);
    expect(result.wotsPkHashes).toEqual([]);
    expect(result.perVaultWotsKeys).toEqual([]);
    expect(root.every((b) => b === 0)).toBe(true);
  });
});
