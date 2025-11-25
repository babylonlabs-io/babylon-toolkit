/**
 * Tests for Bitcoin utility functions
 */

import { describe, expect, it } from "vitest";
import {
  hexToUint8Array,
  isValidHex,
  processPublicKeyToXOnly,
  stripHexPrefix,
  toXOnly,
  uint8ArrayToHex,
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
    it("should return 32-byte array unchanged", () => {
      const bytes32 = new Uint8Array(32).fill(0xaa);
      const result = toXOnly(bytes32);
      expect(result).toEqual(bytes32);
      expect(result.length).toBe(32);
    });

    it("should extract x-only from 33-byte array", () => {
      const bytes33 = new Uint8Array(33).fill(0xbb);
      bytes33[0] = 0x02; // compressed pubkey prefix
      const result = toXOnly(bytes33);
      expect(result.length).toBe(32);
      expect(result[0]).toBe(0xbb); // First byte should be 0xbb, not 0x02
    });

    it("should handle specific test vectors", () => {
      // 33-byte compressed pubkey starting with 0x02
      const compressed = hexToUint8Array("02" + "a".repeat(64));
      expect(compressed.length).toBe(33);

      const xOnly = toXOnly(compressed);
      expect(xOnly.length).toBe(32);
      expect(uint8ArrayToHex(xOnly)).toBe("a".repeat(64));
    });

    it("should preserve x-only key unchanged", () => {
      const xOnlyHex =
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
      const xOnly = hexToUint8Array(xOnlyHex);
      expect(xOnly.length).toBe(32);

      const result = toXOnly(xOnly);
      expect(uint8ArrayToHex(result)).toBe(xOnlyHex);
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
      // Use valid hex chars but wrong length
      expect(() => processPublicKeyToXOnly("aa")).toThrow(
        "Invalid public key length: 2",
      );
      expect(() => processPublicKeyToXOnly("0xaaaa")).toThrow(
        "Invalid public key length: 4",
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

    it("should throw on invalid hex characters in x-only key", () => {
      // Invalid characters in 64-char (x-only) key
      expect(() => processPublicKeyToXOnly("xyz123" + "a".repeat(58))).toThrow(
        "Invalid hex characters in public key",
      );
      expect(() => processPublicKeyToXOnly("gg" + "a".repeat(62))).toThrow(
        "Invalid hex characters in public key",
      );
      expect(() => processPublicKeyToXOnly("z".repeat(64))).toThrow(
        "Invalid hex characters in public key",
      );
    });

    it("should throw on invalid hex characters in compressed key", () => {
      // Invalid characters in 66-char (compressed) key
      expect(() => processPublicKeyToXOnly("02" + "x".repeat(64))).toThrow(
        "Invalid hex characters in public key",
      );
      expect(() => processPublicKeyToXOnly("02xyz" + "a".repeat(60))).toThrow(
        "Invalid hex characters in public key",
      );
    });

    it("should throw on invalid hex characters in uncompressed key", () => {
      // Invalid characters in 130-char (uncompressed) key
      expect(() =>
        processPublicKeyToXOnly("04" + "x".repeat(64) + "a".repeat(64)),
      ).toThrow("Invalid hex characters in public key");
      expect(() =>
        processPublicKeyToXOnly("04" + "a".repeat(64) + "z".repeat(64)),
      ).toThrow("Invalid hex characters in public key");
    });

    it("should throw on invalid hex characters with 0x prefix", () => {
      // Invalid characters with 0x prefix
      expect(() => processPublicKeyToXOnly("0xggg" + "a".repeat(61))).toThrow(
        "Invalid hex characters in public key",
      );
      expect(() =>
        processPublicKeyToXOnly("0x02" + "xyz" + "a".repeat(61)),
      ).toThrow("Invalid hex characters in public key");
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

  describe("hexToUint8Array", () => {
    it("should convert hex string to Uint8Array", () => {
      const result = hexToUint8Array("abc123");
      expect(result instanceof Uint8Array).toBe(true);
      expect(uint8ArrayToHex(result)).toBe("abc123");
    });

    it("should handle 0x prefix", () => {
      const result = hexToUint8Array("0xabc123");
      expect(uint8ArrayToHex(result)).toBe("abc123");
    });

    it("should handle uppercase hex", () => {
      const result = hexToUint8Array("ABC123");
      expect(uint8ArrayToHex(result)).toBe("abc123");
    });

    it("should handle empty string", () => {
      const result = hexToUint8Array("");
      expect(result.length).toBe(0);
    });

    it("should throw on invalid hex", () => {
      expect(() => hexToUint8Array("xyz")).toThrow("Invalid hex string");
      expect(() => hexToUint8Array("abc")).toThrow("Invalid hex string");
      expect(() => hexToUint8Array("0xabc")).toThrow("Invalid hex string");
    });

    it("should convert specific values correctly", () => {
      expect(uint8ArrayToHex(hexToUint8Array("00"))).toBe("00");
      expect(uint8ArrayToHex(hexToUint8Array("ff"))).toBe("ff");
      expect(uint8ArrayToHex(hexToUint8Array("0000"))).toBe("0000");
      expect(uint8ArrayToHex(hexToUint8Array("ffff"))).toBe("ffff");
    });
  });

  describe("uint8ArrayToHex", () => {
    it("should convert Uint8Array to hex string", () => {
      const bytes = new Uint8Array([0xab, 0xc1, 0x23]);
      expect(uint8ArrayToHex(bytes)).toBe("abc123");
    });

    it("should not add 0x prefix", () => {
      const bytes = new Uint8Array([0xab, 0xc1, 0x23]);
      const result = uint8ArrayToHex(bytes);
      expect(result.startsWith("0x")).toBe(false);
    });

    it("should handle empty array", () => {
      const bytes = new Uint8Array(0);
      expect(uint8ArrayToHex(bytes)).toBe("");
    });

    it("should handle specific values", () => {
      expect(uint8ArrayToHex(new Uint8Array([0x00]))).toBe("00");
      expect(uint8ArrayToHex(new Uint8Array([0xff]))).toBe("ff");
      expect(uint8ArrayToHex(new Uint8Array([0x00, 0xff]))).toBe("00ff");
    });

    it("should produce lowercase hex", () => {
      const bytes = new Uint8Array([0xab, 0xcd, 0xef]);
      const result = uint8ArrayToHex(bytes);
      expect(result).toBe("abcdef");
      expect(result).not.toBe("ABCDEF");
    });
  });

  describe("Integration: Round-trip conversions", () => {
    it("should round-trip hex <-> Uint8Array", () => {
      const original = "abc123def456";
      const bytes = hexToUint8Array(original);
      const result = uint8ArrayToHex(bytes);
      expect(result).toBe(original);
    });

    it("should round-trip with 0x prefix", () => {
      const original = "0xabc123def456";
      const bytes = hexToUint8Array(original);
      const result = uint8ArrayToHex(bytes);
      expect(result).toBe("abc123def456"); // prefix removed
    });

    it("should handle public key conversion workflow", () => {
      // Compressed pubkey with 0x prefix (from frontend)
      const compressedWithPrefix = "0x02" + "a".repeat(64);

      // Strip prefix and convert to x-only
      const xOnly = processPublicKeyToXOnly(compressedWithPrefix);
      expect(xOnly.length).toBe(64);

      // Convert to Uint8Array for crypto operations
      const bytes = hexToUint8Array(xOnly);
      expect(bytes.length).toBe(32);

      // Convert back to hex
      const hex = uint8ArrayToHex(bytes);
      expect(hex).toBe("a".repeat(64));
    });
  });

  describe("Edge cases", () => {
    it("should handle all zero values", () => {
      const zeroHex = "00".repeat(32);
      const bytes = hexToUint8Array(zeroHex);
      expect(bytes.length).toBe(32);
      expect(uint8ArrayToHex(bytes)).toBe(zeroHex);
    });

    it("should handle all ff values", () => {
      const ffHex = "ff".repeat(32);
      const bytes = hexToUint8Array(ffHex);
      expect(bytes.length).toBe(32);
      expect(uint8ArrayToHex(bytes)).toBe(ffHex);
    });

    it("should handle mixed case hex", () => {
      const mixed = "aBcDeF123456";
      const bytes = hexToUint8Array(mixed);
      expect(uint8ArrayToHex(bytes)).toBe("abcdef123456");
    });

    it("should preserve leading zeros", () => {
      const withLeadingZeros = "000abc";
      const bytes = hexToUint8Array(withLeadingZeros);
      expect(uint8ArrayToHex(bytes)).toBe("000abc");
      expect(bytes[0]).toBe(0x00);
    });
  });
});
