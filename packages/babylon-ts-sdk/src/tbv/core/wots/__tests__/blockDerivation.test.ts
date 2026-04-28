import { describe, expect, it } from "vitest";

import { expandWotsSeed } from "../../vault-secrets";
import {
  computeWotsBlockPublicKeysHash,
  deriveWotsBlocksFromSeed,
} from "../blockDerivation";

const ROOT_A = new Uint8Array(32).fill(0xaa);
const ROOT_B = new Uint8Array(32).fill(0xbb);

const seedFor = (root: Uint8Array, htlcVout: number) =>
  expandWotsSeed(root, htlcVout);

describe("WOTS block derivation (SDK)", () => {
  describe("deriveWotsBlocksFromSeed", () => {
    it("produces 2 blocks with correct config", async () => {
      const blocks = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      expect(blocks).toHaveLength(2);
      for (const block of blocks) {
        expect(block.config).toEqual({ d: 4, n: 64, checksum_radix: 31 });
      }
    });

    it("each block has 64 message terminals and 2 checksum terminals", async () => {
      const blocks = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      for (const block of blocks) {
        expect(block.message_terminals).toHaveLength(64);
        expect(block.checksum_major_terminal).toHaveLength(20);
        expect(block.checksum_minor_terminal).toHaveLength(20);
      }
    });

    it("all chain values are 20-byte arrays of valid bytes", async () => {
      const blocks = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
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

    it("is deterministic for the same seed", async () => {
      const a = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const b = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      expect(a).toEqual(b);
    });

    it("produces different keys for different htlcVout (per-vault domain separation)", async () => {
      const a = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const b = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 1));
      expect(a[0].message_terminals[0]).not.toEqual(
        b[0].message_terminals[0],
      );
    });

    it("produces different keys for different roots (per-deposit domain separation)", async () => {
      const a = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const b = await deriveWotsBlocksFromSeed(seedFor(ROOT_B, 0));
      expect(a[0].message_terminals[0]).not.toEqual(
        b[0].message_terminals[0],
      );
    });

    it("rejects a seed that is not 64 bytes", async () => {
      await expect(
        deriveWotsBlocksFromSeed(new Uint8Array(32)),
      ).rejects.toThrow(/seed must be exactly 64 bytes/);
      await expect(
        deriveWotsBlocksFromSeed(new Uint8Array(63)),
      ).rejects.toThrow(/seed must be exactly 64 bytes/);
      await expect(
        deriveWotsBlocksFromSeed(new Uint8Array(65)),
      ).rejects.toThrow(/seed must be exactly 64 bytes/);
    });

    it("zeroes the seed after derivation", async () => {
      const seed = seedFor(ROOT_A, 0);
      await deriveWotsBlocksFromSeed(seed);
      expect(seed.every((b) => b === 0)).toBe(true);
    });

    it("zeroes the seed even when validation rejects (defense-in-depth)", async () => {
      const seed = new Uint8Array(32);
      seed.fill(0xab);
      await expect(deriveWotsBlocksFromSeed(seed)).rejects.toThrow(
        /seed must be exactly 64 bytes/,
      );
      expect(seed.every((b) => b === 0)).toBe(true);
    });
  });

  describe("computeWotsBlockPublicKeysHash", () => {
    it("returns a 0x-prefixed 66-character hex string", async () => {
      const blocks = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const hash = computeWotsBlockPublicKeysHash(blocks);
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(hash.length).toBe(66);
    });

    it("returns the same hash for the same keys derived twice", async () => {
      const a = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const b = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      expect(computeWotsBlockPublicKeysHash(a)).toBe(
        computeWotsBlockPublicKeysHash(b),
      );
    });

    it("produces different hashes for different htlcVout values", async () => {
      const a = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const b = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 1));
      expect(computeWotsBlockPublicKeysHash(a)).not.toBe(
        computeWotsBlockPublicKeysHash(b),
      );
    });

    it("changes when a single chain terminal is modified", async () => {
      const blocks = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      const originalHash = computeWotsBlockPublicKeysHash(blocks);

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

    it("rejects blocks with wrong terminal length", () => {
      const badBlock = {
        config: { d: 4, n: 2, checksum_radix: 31 },
        message_terminals: [
          Array.from({ length: 20 }, () => 0),
          Array.from({ length: 10 }, () => 0),
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
          [256, ...Array.from({ length: 19 }, () => 0)],
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
        checksum_minor_terminal: Array.from({ length: 5 }, () => 0),
        checksum_major_terminal: Array.from({ length: 20 }, () => 0),
      };
      expect(() => computeWotsBlockPublicKeysHash([badBlock])).toThrow(
        "checksum_minor_terminal: expected 20 bytes, got 5",
      );
    });

    it("produces a pinned digest for a known root and htlcVout (regression)", async () => {
      // Pinned: root=0xaa…aa, htlcVout=0. Catches drift in chain logic,
      // per-block seed derivation, or keccak256 ordering.
      const PINNED_DIGEST =
        "0x203a4f7d054249aea1785833315628894f4b3fdc17b04aec4e1a3d80c80ef024";
      const blocks = await deriveWotsBlocksFromSeed(seedFor(ROOT_A, 0));
      expect(computeWotsBlockPublicKeysHash(blocks)).toBe(PINNED_DIGEST);
    });
  });
});
