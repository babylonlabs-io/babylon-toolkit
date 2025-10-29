import { redactTelemetry } from "@/ui/common/utils/telemetry";

// Mock the config module
jest.mock("@/ui/common/config", () => ({
  shouldRedactTelemetry: jest.fn(),
}));

import { shouldRedactTelemetry } from "@/ui/common/config";

describe("redactTelemetry", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("falsy values", () => {
    it("returns empty string for undefined", () => {
      expect(redactTelemetry(undefined)).toBe("");
    });

    it("returns empty string for null", () => {
      expect(redactTelemetry(null)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(redactTelemetry("")).toBe("");
    });
  });

  describe("when redaction is disabled", () => {
    beforeEach(() => {
      (shouldRedactTelemetry as jest.Mock).mockReturnValue(false);
    });

    it("returns full value for addresses", () => {
      const address = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";
      expect(redactTelemetry(address)).toBe(address);
    });

    it("returns full value for public keys", () => {
      const pubkey = "02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
      expect(redactTelemetry(pubkey)).toBe(pubkey);
    });
  });

  describe("when redaction is enabled", () => {
    beforeEach(() => {
      (shouldRedactTelemetry as jest.Mock).mockReturnValue(true);
    });

    it("returns short values unchanged (≤8 chars)", () => {
      expect(redactTelemetry("abc")).toBe("abc");
      expect(redactTelemetry("abcdefgh")).toBe("abcdefgh");
    });

    it("trims long addresses to first 4 and last 4 chars", () => {
      const address = "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9";
      expect(redactTelemetry(address)).toBe("bc1q...a8b9");
    });

    it("trims long public keys to first 4 and last 4 chars", () => {
      const pubkey = "02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
      expect(redactTelemetry(pubkey)).toBe("02a1...e3f4");
    });

    it("trims Babylon addresses correctly", () => {
      const bbnAddress = "bbn1qwertyuiopasdfghjklzxcvbnm123456789";
      expect(redactTelemetry(bbnAddress)).toBe("bbn1...6789");
    });
  });
});
