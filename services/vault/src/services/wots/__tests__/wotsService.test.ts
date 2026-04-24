import { describe, expect, it } from "vitest";

import {
  computeWotsPublicKeysHash,
  createVerificationChallenge,
  deriveWotsBlockPublicKeys,
  generateWotsMnemonic,
  getMnemonicWords,
  isValidMnemonic,
  isWotsMismatchError,
  mnemonicToWotsSeed,
  verifyMnemonicWords,
} from "../wotsService";

const KNOWN_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("wotsService", () => {
  describe("generateWotsMnemonic", () => {
    it("generates a valid 12-word mnemonic", () => {
      const mnemonic = generateWotsMnemonic();
      const words = mnemonic.split(" ");
      expect(words).toHaveLength(12);
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it("generates unique mnemonics on each call", () => {
      const a = generateWotsMnemonic();
      const b = generateWotsMnemonic();
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

  describe("deriveWotsBlockPublicKeys", () => {
    const freshSeed = () => mnemonicToWotsSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("produces 2 blocks with correct config", async () => {
      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(blocks).toHaveLength(2);
      for (const block of blocks) {
        expect(block.config).toEqual({ d: 4, n: 64, checksum_radix: 31 });
      }
    });

    it("each block has 64 message terminals and 2 checksum terminals", async () => {
      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      for (const block of blocks) {
        expect(block.message_terminals).toHaveLength(64);
        expect(block.checksum_major_terminal).toHaveLength(20);
        expect(block.checksum_minor_terminal).toHaveLength(20);
      }
    });

    it("all chain values are 20-byte arrays of numbers", async () => {
      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      for (const block of blocks) {
        for (const terminal of block.message_terminals) {
          expect(terminal).toHaveLength(20);
          terminal.forEach((b) => {
            expect(typeof b).toBe("number");
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(255);
          });
        }
      }
    });

    it("is deterministic for the same inputs", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(a).toEqual(b);
    });

    it("produces different keys for different vault IDs", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        "vault-2",
        depositorPk,
        appContractAddress,
      );
      expect(a[0].message_terminals[0]).not.toEqual(b[0].message_terminals[0]);
    });

    it("handles 0x-prefixed vaultId and depositorPk the same as unprefixed", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        "0xdeadbeef",
        "0xpk123",
        "0x1234",
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        "deadbeef",
        "pk123",
        "0x1234",
      );
      expect(a).toEqual(b);
    });

    it("normalizes appContractAddress case (EIP-55 checksummed vs lowercase)", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        "0xabcdef1234567890abcdef1234567890abcdef12",
      );
      expect(a).toEqual(b);
    });
  });

  describe("computeWotsPublicKeysHash", () => {
    const freshSeed = () => mnemonicToWotsSeed(KNOWN_MNEMONIC);
    const vaultId = "vault-1";
    const depositorPk = "pk-abc";
    const appContractAddress = "0x1234";

    it("returns a 0x-prefixed 66-character hex string", async () => {
      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const hash = computeWotsPublicKeysHash(blocks);
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(hash.length).toBe(66);
    });

    it("returns the same hash for the same keys derived twice", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(computeWotsPublicKeysHash(a)).toBe(computeWotsPublicKeysHash(b));
    });

    it("produces different hashes for different vault IDs", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        "vault-1",
        depositorPk,
        appContractAddress,
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        "vault-2",
        depositorPk,
        appContractAddress,
      );
      expect(computeWotsPublicKeysHash(a)).not.toBe(
        computeWotsPublicKeysHash(b),
      );
    });

    it("changes when a single chain terminal is modified", async () => {
      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const originalHash = computeWotsPublicKeysHash(blocks);

      // Deep-copy and flip one byte in the last message terminal of block 1
      const tampered = blocks.map((b) => ({
        ...b,
        message_terminals: b.message_terminals.map((t) => [...t]),
      }));
      tampered[1].message_terminals[63][0] ^= 0x01;

      expect(computeWotsPublicKeysHash(tampered)).not.toBe(originalHash);
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
      expect(isWotsMismatchError(new Error("Missing transaction hash"))).toBe(
        false,
      );
    });

    it("returns false for generic errors", () => {
      expect(isWotsMismatchError(new Error("Failed to submit wots key"))).toBe(
        false,
      );
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
