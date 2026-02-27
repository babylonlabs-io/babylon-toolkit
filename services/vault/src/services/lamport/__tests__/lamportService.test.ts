import { describe, expect, it } from "vitest";

import {
  computeLamportPkHash,
  createVerificationChallenge,
  deriveLamportKeypair,
  generateLamportMnemonic,
  getMnemonicWords,
  isValidMnemonic,
  keypairToPublicKey,
  mnemonicToLamportSeed,
  verifyMnemonicWords,
} from "../lamportService";

const KNOWN_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("lamportService", () => {
  describe("generateLamportMnemonic", () => {
    it("generates a valid 12-word mnemonic", () => {
      const mnemonic = generateLamportMnemonic();
      const words = mnemonic.split(" ");
      expect(words).toHaveLength(12);
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it("generates unique mnemonics on each call", () => {
      const a = generateLamportMnemonic();
      const b = generateLamportMnemonic();
      expect(a).not.toBe(b);
    });
  });

  describe("isValidMnemonic", () => {
    it("accepts a valid mnemonic", () => {
      expect(isValidMnemonic(KNOWN_MNEMONIC)).toBe(true);
    });

    it("rejects an invalid mnemonic", () => {
      expect(isValidMnemonic("not a valid mnemonic phrase")).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(isValidMnemonic("")).toBe(false);
    });
  });

  describe("getMnemonicWords", () => {
    it("splits a mnemonic into individual words", () => {
      const words = getMnemonicWords("alpha bravo charlie");
      expect(words).toEqual(["alpha", "bravo", "charlie"]);
    });
  });

  describe("createVerificationChallenge", () => {
    it("returns the requested number of indices", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 4);
      expect(challenge.indices).toHaveLength(4);
      expect(challenge.expectedWords).toHaveLength(4);
    });

    it("returns sorted, unique indices", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 5);
      const sorted = [...challenge.indices].sort((a, b) => a - b);
      expect(challenge.indices).toEqual(sorted);
      expect(new Set(challenge.indices).size).toBe(challenge.indices.length);
    });

    it("maps indices to the correct words", () => {
      const words = getMnemonicWords(KNOWN_MNEMONIC);
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 3);
      challenge.indices.forEach((idx, i) => {
        expect(challenge.expectedWords[i]).toBe(words[idx]);
      });
    });
  });

  describe("verifyMnemonicWords", () => {
    it("returns true for correct answers", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 3);
      expect(verifyMnemonicWords(challenge, challenge.expectedWords)).toBe(
        true,
      );
    });

    it("is case-insensitive", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 3);
      const upper = challenge.expectedWords.map((w) => w.toUpperCase());
      expect(verifyMnemonicWords(challenge, upper)).toBe(true);
    });

    it("trims whitespace from answers", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 3);
      const padded = challenge.expectedWords.map((w) => `  ${w}  `);
      expect(verifyMnemonicWords(challenge, padded)).toBe(true);
    });

    it("returns false for incorrect answers", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 3);
      expect(verifyMnemonicWords(challenge, ["wrong", "words", "here"])).toBe(
        false,
      );
    });

    it("returns false when answer count mismatches", () => {
      const challenge = createVerificationChallenge(KNOWN_MNEMONIC, 3);
      expect(verifyMnemonicWords(challenge, ["one"])).toBe(false);
    });
  });

  describe("mnemonicToLamportSeed", () => {
    it("produces a 64-byte seed", () => {
      const seed = mnemonicToLamportSeed(KNOWN_MNEMONIC);
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(64);
    });

    it("is deterministic for the same mnemonic", () => {
      const a = mnemonicToLamportSeed(KNOWN_MNEMONIC);
      const b = mnemonicToLamportSeed(KNOWN_MNEMONIC);
      expect(a).toEqual(b);
    });
  });

  describe("deriveLamportKeypair", () => {
    // deriveLamportKeypair zeros the seed after use, so each test must
    // create a fresh copy to avoid cross-test contamination.
    const freshSeed = () => mnemonicToLamportSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("generates 508 preimage and hash slots per type", async () => {
      const keypair = await deriveLamportKeypair(
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
      const keypair = await deriveLamportKeypair(
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
      const a = await deriveLamportKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const b = await deriveLamportKeypair(
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

    it("produces different keys for different vault IDs", async () => {
      const a = await deriveLamportKeypair(
        freshSeed(),
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const b = await deriveLamportKeypair(
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
      const seed = mnemonicToLamportSeed(KNOWN_MNEMONIC);
      const keypair = await deriveLamportKeypair(
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

  describe("computeLamportPkHash", () => {
    // Use a factory — deriveLamportKeypair zeros the seed after use
    const freshSeed = () => mnemonicToLamportSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("produces a deterministic hash for known inputs", async () => {
      const keypair = await deriveLamportKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const hash = computeLamportPkHash(keypair);
      expect(hash).toBe(
        "0x27242076796ab9f57b3734af2cc39bf367f26aecced2bdd200a609052657e98e",
      );
    });

    it("returns the same hash for the same keypair derived twice", async () => {
      const keypairA = await deriveLamportKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const keypairB = await deriveLamportKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(computeLamportPkHash(keypairA)).toBe(
        computeLamportPkHash(keypairB),
      );
    });

    it("produces different hashes for different vault IDs", async () => {
      const keypairA = await deriveLamportKeypair(
        freshSeed(),
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const keypairB = await deriveLamportKeypair(
        freshSeed(),
        "vault-2",
        depositorPk,
        appContractAddress,
      );
      expect(computeLamportPkHash(keypairA)).not.toBe(
        computeLamportPkHash(keypairB),
      );
    });

    it("returns a 0x-prefixed 66-character hex string", async () => {
      const keypair = await deriveLamportKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const hash = computeLamportPkHash(keypair);
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(hash.length).toBe(66);
    });

    it("changes when a single bit position hash is modified", async () => {
      const keypair = await deriveLamportKeypair(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const originalHash = computeLamportPkHash(keypair);

      // Flip one byte in the last trueHash (bit position 507)
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

      expect(computeLamportPkHash(tampered)).not.toBe(originalHash);
    });
  });
});
