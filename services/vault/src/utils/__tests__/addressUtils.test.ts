import { describe, expect, it } from "vitest";

import { truncateAddress, truncateHash } from "../addressUtils";

describe("Address Utilities", () => {
  describe("truncateAddress", () => {
    it("should truncate a long Ethereum address", () => {
      expect(
        truncateAddress("0x1234567890abcdef1234567890abcdef12345678"),
      ).toBe("0x1234...5678");
    });

    it("should return the address unchanged if shorter than min length", () => {
      expect(truncateAddress("0x123456")).toBe("0x123456");
    });

    it("should return empty string unchanged", () => {
      expect(truncateAddress("")).toBe("");
    });

    it("should truncate address at exactly min length", () => {
      expect(truncateAddress("0x12345678")).toBe("0x1234...5678");
    });

    it("should truncate address over min length", () => {
      expect(truncateAddress("0x123456789")).toBe("0x1234...6789");
    });
  });

  describe("truncateHash", () => {
    it("should truncate a long transaction hash", () => {
      expect(
        truncateHash(
          "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        ),
      ).toBe("0xa1b2...a1b2");
    });

    it("should return the hash unchanged if shorter than min length", () => {
      expect(truncateHash("0x1234")).toBe("0x1234");
    });

    it("should return empty string unchanged", () => {
      expect(truncateHash("")).toBe("");
    });

    it("should truncate hash at exactly min length", () => {
      expect(truncateHash("0x12345678")).toBe("0x1234...5678");
    });

    it("should truncate hash over min length", () => {
      expect(truncateHash("0x123456789")).toBe("0x1234...6789");
    });
  });
});
