/**
 * Tests for Bitcoin utility functions
 */

import { describe, expect, it } from "vitest";
import {
  bufferToHex,
  hexToBuffer,
  isValidHex,
  processPublicKeyToXOnly,
  stripHexPrefix,
  toXOnly,
} from "../bitcoin";

describe("Bitcoin Utilities", () => {
  describe("stripHexPrefix", () => {
    it("should remove 0x prefix", () => {
      expect(stripHexPrefix("0xabc123")).toBe("abc123");
      expect(stripHexPrefix("0xABC123")).toBe("ABC123");
      expect(stripHexPrefix("0x0")).toBe("0");
    });

    it("should not modify string without prefix", () => {
      expect(stripHexPrefix("abc123")).toBe("abc123");
      expect(stripHexPrefix("ABC123")).toBe("ABC123");
      expect(stripHexPrefix("0abc")).toBe("0abc");
    });

    it("should handle empty string", () => {
      expect(stripHexPrefix("")).toBe("");
    });

    it("should handle edge cases", () => {
      expect(stripHexPrefix("0x")).toBe("");
      // Note: only lowercase "0x" is stripped, uppercase "0X" is not a valid prefix
      expect(stripHexPrefix("0X")).toBe("0X");
    });
  });

  describe("toXOnly", () => {
    it("should return 32-byte buffer unchanged", () => {
      const buf32 = Buffer.alloc(32, 0xaa);
      const result = toXOnly(buf32);
      expect(result).toEqual(buf32);
      expect(result.length).toBe(32);
    });

    it("should extract x-only from 33-byte buffer", () => {
      const buf33 = Buffer.alloc(33, 0xbb);
      buf33[0] = 0x02; // compressed pubkey prefix
      const result = toXOnly(buf33);
      expect(result.length).toBe(32);
      expect(result[0]).toBe(0xbb); // First byte should be 0xbb, not 0x02
    });

    it("should handle specific test vectors", () => {
      // 33-byte compressed pubkey starting with 0x02
      const compressed = Buffer.from("02" + "a".repeat(64), "hex");
      expect(compressed.length).toBe(33);

      const xOnly = toXOnly(compressed);
      expect(xOnly.length).toBe(32);
      expect(xOnly.toString("hex")).toBe("a".repeat(64));
    });

    it("should preserve x-only key unchanged", () => {
      const xOnlyHex =
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
      const xOnly = Buffer.from(xOnlyHex, "hex");
      expect(xOnly.length).toBe(32);

      const result = toXOnly(xOnly);
      expect(result.toString("hex")).toBe(xOnlyHex);
    });
  });

  describe("processPublicKeyToXOnly", () => {
    it("should return x-only pubkey unchanged", () => {
      const xOnly = "a".repeat(64); // 32 bytes = 64 hex chars
      expect(processPublicKeyToXOnly(xOnly)).toBe(xOnly);
    });

    it("should convert compressed pubkey to x-only", () => {
      const compressed = "02" + "a".repeat(64); // 33 bytes = 66 hex chars
      const result = processPublicKeyToXOnly(compressed);
      expect(result).toBe("a".repeat(64));
      expect(result.length).toBe(64);
    });

    it("should convert uncompressed pubkey to x-only", () => {
      const uncompressed = "04" + "a".repeat(64) + "b".repeat(64); // 65 bytes = 130 hex chars
      const result = processPublicKeyToXOnly(uncompressed);
      expect(result).toBe("a".repeat(64));
      expect(result.length).toBe(64);
    });

    it("should handle 0x prefix on x-only key", () => {
      const xOnly = "0x" + "a".repeat(64);
      const result = processPublicKeyToXOnly(xOnly);
      expect(result).toBe("a".repeat(64));
    });

    it("should handle 0x prefix on compressed key", () => {
      const compressed = "0x02" + "a".repeat(64);
      const result = processPublicKeyToXOnly(compressed);
      expect(result).toBe("a".repeat(64));
    });

    it("should handle 0x prefix on uncompressed key", () => {
      const uncompressed = "0x04" + "a".repeat(64) + "b".repeat(64);
      const result = processPublicKeyToXOnly(uncompressed);
      expect(result).toBe("a".repeat(64));
    });

    it("should throw on invalid length", () => {
      expect(() => processPublicKeyToXOnly("abc")).toThrow(
        "Invalid public key length: 3",
      );
      expect(() => processPublicKeyToXOnly("0xabc")).toThrow(
        "Invalid public key length: 3",
      );
      expect(() => processPublicKeyToXOnly("a".repeat(60))).toThrow(
        "Invalid public key length: 60",
      );
      expect(() => processPublicKeyToXOnly("a".repeat(70))).toThrow(
        "Invalid public key length: 70",
      );
    });

    it("should handle real test vectors", () => {
      // Test with actual secp256k1 public keys from test helpers
      const depositorKey =
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
      const claimerKey =
        "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

      expect(processPublicKeyToXOnly(depositorKey)).toBe(depositorKey);
      expect(processPublicKeyToXOnly("0x" + depositorKey)).toBe(depositorKey);

      expect(processPublicKeyToXOnly(claimerKey)).toBe(claimerKey);
      expect(processPublicKeyToXOnly("0x" + claimerKey)).toBe(claimerKey);
    });

    it("should handle compressed keys with different prefixes", () => {
      const key = "a".repeat(64);

      // 0x02 prefix (even y-coordinate)
      expect(processPublicKeyToXOnly("02" + key)).toBe(key);

      // 0x03 prefix (odd y-coordinate)
      expect(processPublicKeyToXOnly("03" + key)).toBe(key);
    });
  });

  describe("isValidHex", () => {
    it("should validate hex strings", () => {
      expect(isValidHex("abc123")).toBe(true);
      expect(isValidHex("ABC123")).toBe(true);
      expect(isValidHex("0123456789abcdefABCDEF")).toBe(true);
    });

    it("should validate hex with 0x prefix", () => {
      expect(isValidHex("0xabc123")).toBe(true);
      expect(isValidHex("0xABC123")).toBe(true);
    });

    it("should reject invalid characters", () => {
      expect(isValidHex("xyz")).toBe(false);
      expect(isValidHex("abcg")).toBe(false);
      expect(isValidHex("abc xyz")).toBe(false);
      expect(isValidHex("abc-123")).toBe(false);
    });

    it("should reject odd length", () => {
      expect(isValidHex("abc")).toBe(false);
      expect(isValidHex("a")).toBe(false);
      expect(isValidHex("0xabc")).toBe(false);
    });

    it("should handle empty string", () => {
      expect(isValidHex("")).toBe(true);
      expect(isValidHex("0x")).toBe(true);
    });

    it("should validate various lengths", () => {
      expect(isValidHex("ab")).toBe(true);
      expect(isValidHex("abcd")).toBe(true);
      expect(isValidHex("a".repeat(64))).toBe(true);
      expect(isValidHex("a".repeat(128))).toBe(true);
    });
  });

  describe("hexToBuffer", () => {
    it("should convert hex string to Buffer", () => {
      const result = hexToBuffer("abc123");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString("hex")).toBe("abc123");
    });

    it("should handle 0x prefix", () => {
      const result = hexToBuffer("0xabc123");
      expect(result.toString("hex")).toBe("abc123");
    });

    it("should handle uppercase hex", () => {
      const result = hexToBuffer("ABC123");
      expect(result.toString("hex")).toBe("abc123");
    });

    it("should handle empty string", () => {
      const result = hexToBuffer("");
      expect(result.length).toBe(0);
    });

    it("should throw on invalid hex", () => {
      expect(() => hexToBuffer("xyz")).toThrow("Invalid hex string");
      expect(() => hexToBuffer("abc")).toThrow("Invalid hex string");
      expect(() => hexToBuffer("0xabc")).toThrow("Invalid hex string");
    });

    it("should convert specific values correctly", () => {
      expect(hexToBuffer("00").toString("hex")).toBe("00");
      expect(hexToBuffer("ff").toString("hex")).toBe("ff");
      expect(hexToBuffer("0000").toString("hex")).toBe("0000");
      expect(hexToBuffer("ffff").toString("hex")).toBe("ffff");
    });
  });

  describe("bufferToHex", () => {
    it("should convert Buffer to hex string", () => {
      const buf = Buffer.from([0xab, 0xc1, 0x23]);
      expect(bufferToHex(buf)).toBe("abc123");
    });

    it("should not add 0x prefix", () => {
      const buf = Buffer.from([0xab, 0xc1, 0x23]);
      const result = bufferToHex(buf);
      expect(result.startsWith("0x")).toBe(false);
    });

    it("should handle empty buffer", () => {
      const buf = Buffer.alloc(0);
      expect(bufferToHex(buf)).toBe("");
    });

    it("should handle specific values", () => {
      expect(bufferToHex(Buffer.from([0x00]))).toBe("00");
      expect(bufferToHex(Buffer.from([0xff]))).toBe("ff");
      expect(bufferToHex(Buffer.from([0x00, 0xff]))).toBe("00ff");
    });

    it("should produce lowercase hex", () => {
      const buf = Buffer.from([0xab, 0xcd, 0xef]);
      const result = bufferToHex(buf);
      expect(result).toBe("abcdef");
      expect(result).not.toBe("ABCDEF");
    });
  });

  describe("Integration: Round-trip conversions", () => {
    it("should round-trip hex <-> buffer", () => {
      const original = "abc123def456";
      const buffer = hexToBuffer(original);
      const result = bufferToHex(buffer);
      expect(result).toBe(original);
    });

    it("should round-trip with 0x prefix", () => {
      const original = "0xabc123def456";
      const buffer = hexToBuffer(original);
      const result = bufferToHex(buffer);
      expect(result).toBe("abc123def456"); // prefix removed
    });

    it("should handle public key conversion workflow", () => {
      // Compressed pubkey with 0x prefix (from frontend)
      const compressedWithPrefix = "0x02" + "a".repeat(64);

      // Strip prefix and convert to x-only
      const xOnly = processPublicKeyToXOnly(compressedWithPrefix);
      expect(xOnly.length).toBe(64);

      // Convert to buffer for crypto operations
      const buffer = hexToBuffer(xOnly);
      expect(buffer.length).toBe(32);

      // Convert back to hex
      const hex = bufferToHex(buffer);
      expect(hex).toBe("a".repeat(64));
    });
  });

  describe("Edge cases", () => {
    it("should handle all zero values", () => {
      const zeroHex = "00".repeat(32);
      const buffer = hexToBuffer(zeroHex);
      expect(buffer.length).toBe(32);
      expect(bufferToHex(buffer)).toBe(zeroHex);
    });

    it("should handle all ff values", () => {
      const ffHex = "ff".repeat(32);
      const buffer = hexToBuffer(ffHex);
      expect(buffer.length).toBe(32);
      expect(bufferToHex(buffer)).toBe(ffHex);
    });

    it("should handle mixed case hex", () => {
      const mixed = "aBcDeF123456";
      const buffer = hexToBuffer(mixed);
      expect(bufferToHex(buffer)).toBe("abcdef123456");
    });

    it("should preserve leading zeros", () => {
      const withLeadingZeros = "000abc";
      const buffer = hexToBuffer(withLeadingZeros);
      expect(bufferToHex(buffer)).toBe("000abc");
      expect(buffer[0]).toBe(0x00);
    });
  });
});
