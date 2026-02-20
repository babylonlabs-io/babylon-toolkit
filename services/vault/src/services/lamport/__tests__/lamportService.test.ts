import { describe, expect, it } from "vitest";

import {
  createVerificationChallenge,
  deriveLamportKeypair,
  generateLamportMnemonic,
  getMnemonicWords,
  isValidMnemonic,
  keypairToHex,
  mnemonicToLamportSeed,
  verifyMnemonicWords,
} from "../lamportService";

const KNOWN_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

describe("lamportService", () => {
  describe("generateLamportMnemonic", () => {
    it("generates a valid 24-word mnemonic", () => {
      const mnemonic = generateLamportMnemonic();
      const words = mnemonic.split(" ");
      expect(words).toHaveLength(24);
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

    it("generates 512 private and public key slots", async () => {
      const keypair = await deriveLamportKeypair(
        seed,
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(keypair.privateKey).toHaveLength(512);
      expect(keypair.publicKey).toHaveLength(512);
    });

    it("produces 16-byte private keys and 20-byte public keys", async () => {
      const keypair = await deriveLamportKeypair(
        seed,
        vaultId,
        depositorPk,
        appContractAddress,
      );
      keypair.privateKey.forEach((pk) => expect(pk.length).toBe(16));
      keypair.publicKey.forEach((pk) => expect(pk.length).toBe(20));
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
      expect(a.privateKey).toEqual(b.privateKey);
      expect(a.publicKey).toEqual(b.publicKey);
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
      expect(a.privateKey[0]).not.toEqual(b.privateKey[0]);
    });
  });

  describe("keypairToHex", () => {
    it("converts keypair byte arrays to hex strings", async () => {
      const seed = mnemonicToLamportSeed(KNOWN_MNEMONIC);
      const keypair = await deriveLamportKeypair(
        seed,
        "vault-1",
        "pk-abc",
        "0x1234",
      );
      const hex = keypairToHex(keypair);

      expect(hex.privateKey).toHaveLength(512);
      expect(hex.publicKey).toHaveLength(512);
      hex.privateKey.forEach((h) => expect(h).toMatch(/^[0-9a-f]{32}$/));
      hex.publicKey.forEach((h) => expect(h).toMatch(/^[0-9a-f]{40}$/));
    });
  });
});
