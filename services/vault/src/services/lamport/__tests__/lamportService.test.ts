import { describe, expect, it } from "vitest";

import {
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
    const seed = mnemonicToLamportSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("generates 508 preimage and hash slots per type", async () => {
      const keypair = await deriveLamportKeypair(
        seed,
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
        seed,
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
        seed,
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const b = await deriveLamportKeypair(
        seed,
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
        seed,
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const b = await deriveLamportKeypair(
        seed,
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
});
