import { describe, expect, it } from "vitest";

import {
  computeWotsPkHash,
  deriveWotsKeypair,
  keypairToPublicKey,
  mnemonicToWotsSeed,
} from "../derivation";
import { deriveWotsPkHash } from "../deriveWotsPkHash";
import { isWotsMismatchError } from "../errors";

const KNOWN_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("WOTS derivation (SDK)", () => {
  describe("mnemonicToWotsSeed", () => {
    it("produces a 64-byte seed", () => {
      const seed = mnemonicToWotsSeed(KNOWN_MNEMONIC);
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(64);
    });

    it("is deterministic for the same mnemonic", () => {
      const a = mnemonicToWotsSeed(KNOWN_MNEMONIC);
      const b = mnemonicToWotsSeed(KNOWN_MNEMONIC);
      expect(a).toEqual(b);
    });
  });

  describe("deriveWotsKeypair", () => {
    const freshSeed = () => mnemonicToWotsSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("generates 508 preimage and hash slots per type", async () => {
      const keypair = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(keypair.falsePreimages).toHaveLength(508);
      expect(keypair.truePreimages).toHaveLength(508);
      expect(keypair.falseHashes).toHaveLength(508);
      expect(keypair.trueHashes).toHaveLength(508);
    });

    it("produces 16-byte preimages and 20-byte hashes", async () => {
      const keypair = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      keypair.falsePreimages.forEach((p) => expect(p.length).toBe(16));
      keypair.truePreimages.forEach((p) => expect(p.length).toBe(16));
      keypair.falseHashes.forEach((h) => expect(h.length).toBe(20));
      keypair.trueHashes.forEach((h) => expect(h.length).toBe(20));
    });

    it("is deterministic for the same inputs", async () => {
      const a = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const b = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(a.falsePreimages).toEqual(b.falsePreimages);
      expect(a.truePreimages).toEqual(b.truePreimages);
      expect(a.falseHashes).toEqual(b.falseHashes);
      expect(a.trueHashes).toEqual(b.trueHashes);
    });

    it("rejects a seed that is not 64 bytes", async () => {
      await expect(
        deriveWotsKeypair(
          new Uint8Array(32),
          vaultId,
          depositorPk,
          appContractAddress,
        ),
      ).rejects.toThrow(/seed must be 64 bytes/);
    });

    it("produces different keys for different vault IDs", async () => {
      const a = await deriveWotsKeypair(
        freshSeed(),
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const b = await deriveWotsKeypair(
        freshSeed(),
        "vault-2",
        depositorPk,
        appContractAddress,
      );
      expect(a.falsePreimages[0]).not.toEqual(b.falsePreimages[0]);
    });
  });

  describe("keypairToPublicKey", () => {
    it("converts keypair hashes to hex strings", async () => {
      const seed = mnemonicToWotsSeed(KNOWN_MNEMONIC);
      const keypair = await deriveWotsKeypair(
        seed,
        "vault-1",
        "pk-abc",
        "0x1234",
      );
      const pubkey = keypairToPublicKey(keypair);

      expect(pubkey.false_list).toHaveLength(508);
      expect(pubkey.true_list).toHaveLength(508);
      pubkey.false_list.forEach((h: string) =>
        expect(h).toMatch(/^[0-9a-f]{40}$/),
      );
      pubkey.true_list.forEach((h: string) =>
        expect(h).toMatch(/^[0-9a-f]{40}$/),
      );
    });
  });

  describe("computeWotsPkHash", () => {
    const freshSeed = () => mnemonicToWotsSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("produces a deterministic hash for known inputs", async () => {
      const keypair = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const hash = computeWotsPkHash(keypair);
      expect(hash).toBe(
        "0x27242076796ab9f57b3734af2cc39bf367f26aecced2bdd200a609052657e98e",
      );
    });

    it("returns the same hash for the same keypair derived twice", async () => {
      const keypairA = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const keypairB = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(computeWotsPkHash(keypairA)).toBe(
        computeWotsPkHash(keypairB),
      );
    });

    it("produces different hashes for different vault IDs", async () => {
      const keypairA = await deriveWotsKeypair(
        freshSeed(),
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const keypairB = await deriveWotsKeypair(
        freshSeed(),
        "vault-2",
        depositorPk,
        appContractAddress,
      );
      expect(computeWotsPkHash(keypairA)).not.toBe(
        computeWotsPkHash(keypairB),
      );
    });

    it("returns a 0x-prefixed 66-character hex string", async () => {
      const keypair = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const hash = computeWotsPkHash(keypair);
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(hash.length).toBe(66);
    });

    it("changes when a single bit position hash is modified", async () => {
      const keypair = await deriveWotsKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const originalHash = computeWotsPkHash(keypair);

      const tampered: typeof keypair = {
        falsePreimages: keypair.falsePreimages,
        truePreimages: keypair.truePreimages,
        falseHashes: keypair.falseHashes,
        trueHashes: keypair.trueHashes.map((h, i) => {
          if (i === 507) {
            const copy = new Uint8Array(h);
            copy[0] ^= 0x01;
            return copy;
          }
          return h;
        }),
      };

      expect(computeWotsPkHash(tampered)).not.toBe(originalHash);
    });
  });

  describe("deriveWotsPkHash", () => {
    it("produces the same hash as manual seed + derive + compute", async () => {
      const vaultId = "vault-1";
      const depositorPk = "pk-abc";
      const appContractAddress = "0x1234";

      const hash = await deriveWotsPkHash(
        KNOWN_MNEMONIC,
        vaultId,
        depositorPk,
        appContractAddress,
      );

      expect(hash).toBe(
        "0x27242076796ab9f57b3734af2cc39bf367f26aecced2bdd200a609052657e98e",
      );
    });
  });

  describe("isWotsMismatchError", () => {
    it("returns true for the exact VP error message", () => {
      const err = new Error(
        "WOTS public key hash does not match on-chain commitment",
      );
      expect(isWotsMismatchError(err)).toBe(true);
    });

    it("returns true when the VP message is embedded in a wrapper error", () => {
      const err = new Error(
        "RPC error: WOTS public key hash does not match on-chain commitment (code 3002)",
      );
      expect(isWotsMismatchError(err)).toBe(true);
    });

    it("returns false for network errors", () => {
      expect(isWotsMismatchError(new Error("fetch failed"))).toBe(false);
    });

    it("returns false for missing field errors", () => {
      expect(
        isWotsMismatchError(new Error("Missing transaction hash")),
      ).toBe(false);
    });

    it("returns false for generic errors", () => {
      expect(
        isWotsMismatchError(new Error("Failed to submit wots key")),
      ).toBe(false);
    });

    it("handles string errors", () => {
      expect(
        isWotsMismatchError(
          "WOTS public key hash does not match on-chain commitment",
        ),
      ).toBe(true);
    });

    it("handles non-error values", () => {
      expect(isWotsMismatchError(null)).toBe(false);
      expect(isWotsMismatchError(undefined)).toBe(false);
      expect(isWotsMismatchError(42)).toBe(false);
    });
  });
});
