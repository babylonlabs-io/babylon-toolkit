import { describe, expect, it } from "vitest";

import {
  computeWotsBlockPublicKeysHash,
  deriveWotsBlockPublicKeys,
} from "../blockDerivation";
import { mnemonicToWotsSeed } from "../blockDerivation";

const KNOWN_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("WOTS block derivation (SDK)", () => {
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

    it("all chain values are 20-byte arrays of valid bytes", async () => {
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
      expect(a[0].message_terminals[0]).not.toEqual(
        b[0].message_terminals[0],
      );
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

    it("rejects a seed that is not 64 bytes", async () => {
      await expect(
        deriveWotsBlockPublicKeys(
          new Uint8Array(32),
          vaultId,
          depositorPk,
          appContractAddress,
        ),
      ).rejects.toThrow(/seed must be exactly 64 bytes/);
    });

    it("zeroes the seed after derivation", async () => {
      const seed = freshSeed();
      await deriveWotsBlockPublicKeys(
        seed,
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(seed.every((b) => b === 0)).toBe(true);
    });

    it("produces different keys for different app contract addresses", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        "0x1234",
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        "0x5678",
      );
      expect(a[0].message_terminals[0]).not.toEqual(
        b[0].message_terminals[0],
      );
    });

    it("produces different keys for different depositor public keys", async () => {
      const a = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        "pk-abc",
        appContractAddress,
      );
      const b = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        "pk-xyz",
        appContractAddress,
      );
      expect(a[0].message_terminals[0]).not.toEqual(
        b[0].message_terminals[0],
      );
    });
  });

  describe("computeWotsBlockPublicKeysHash", () => {
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
      const hash = computeWotsBlockPublicKeysHash(blocks);
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
      expect(computeWotsBlockPublicKeysHash(a)).toBe(
        computeWotsBlockPublicKeysHash(b),
      );
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
      expect(computeWotsBlockPublicKeysHash(a)).not.toBe(
        computeWotsBlockPublicKeysHash(b),
      );
    });

    it("changes when a single chain terminal is modified", async () => {
      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      const originalHash = computeWotsBlockPublicKeysHash(blocks);

      // Deep-copy and flip one byte in the last message terminal of block 1
      const tampered = blocks.map((b) => ({
        ...b,
        message_terminals: b.message_terminals.map((t) => [...t]),
      }));
      tampered[1].message_terminals[63][0] ^= 0x01;

      expect(computeWotsBlockPublicKeysHash(tampered)).not.toBe(originalHash);
    });

    it("throws for empty public keys array", () => {
      expect(() => computeWotsBlockPublicKeysHash([])).toThrow(
        "must not be empty",
      );
    });

    it("produces a pinned digest for a known mnemonic and inputs", async () => {
      // Regression test: pin the hash so any change to canonical ordering
      // or derivation logic is caught immediately.
      // Derived from: mnemonic="abandon...about", vaultId="vault-1",
      // depositorPk="pk-abc", appContractAddress="0x1234"
      const PINNED_DIGEST =
        "0x59a29c3eeba687882db6388e7e27ab6b94ab96371e812c36e037dfa1b270c9ac";

      const blocks = await deriveWotsBlockPublicKeys(
        freshSeed(),
        vaultId,
        depositorPk,
        appContractAddress,
      );
      expect(computeWotsBlockPublicKeysHash(blocks)).toBe(PINNED_DIGEST);
    });

    it("rejects blocks with wrong terminal length", () => {
      const badBlock = {
        config: { d: 4, n: 2, checksum_radix: 31 },
        message_terminals: [
          Array.from({ length: 20 }, () => 0),
          Array.from({ length: 10 }, () => 0), // wrong: 10 instead of 20
        ],
        checksum_minor_terminal: Array.from({ length: 20 }, () => 0),
        checksum_major_terminal: Array.from({ length: 20 }, () => 0),
      };
      expect(() => computeWotsBlockPublicKeysHash([badBlock])).toThrow(
        "expected 20 bytes, got 10",
      );
    });

    it("rejects blocks with out-of-range byte values", () => {
      const badBlock = {
        config: { d: 4, n: 1, checksum_radix: 31 },
        message_terminals: [
          [256, ...Array.from({ length: 19 }, () => 0)], // 256 is out of range
        ],
        checksum_minor_terminal: Array.from({ length: 20 }, () => 0),
        checksum_major_terminal: Array.from({ length: 20 }, () => 0),
      };
      expect(() => computeWotsBlockPublicKeysHash([badBlock])).toThrow(
        "invalid byte value 256",
      );
    });

    it("rejects blocks with negative byte values", () => {
      const badBlock = {
        config: { d: 4, n: 1, checksum_radix: 31 },
        message_terminals: [Array.from({ length: 20 }, () => 0)],
        checksum_minor_terminal: [-1, ...Array.from({ length: 19 }, () => 0)],
        checksum_major_terminal: Array.from({ length: 20 }, () => 0),
      };
      expect(() => computeWotsBlockPublicKeysHash([badBlock])).toThrow(
        "invalid byte value -1",
      );
    });

    it("rejects blocks with wrong checksum terminal length", () => {
      const badBlock = {
        config: { d: 4, n: 1, checksum_radix: 31 },
        message_terminals: [Array.from({ length: 20 }, () => 0)],
        checksum_minor_terminal: Array.from({ length: 5 }, () => 0), // wrong
        checksum_major_terminal: Array.from({ length: 20 }, () => 0),
      };
      expect(() => computeWotsBlockPublicKeysHash([badBlock])).toThrow(
        "checksum_minor_terminal: expected 20 bytes, got 5",
      );
    });
  });
});
