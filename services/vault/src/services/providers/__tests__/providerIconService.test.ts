import { afterEach, describe, expect, it, vi } from "vitest";

import { getProviderIconUrl } from "../providerIconService";

describe("providerIconService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getProviderIconUrl", () => {
    it("returns undefined when API URL is not configured", () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "");

      expect(getProviderIconUrl("0xABC123")).toBeUndefined();
    });

    it("returns undefined when providerId is empty", () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");

      expect(getProviderIconUrl("")).toBeUndefined();
    });

    it("lowercases the providerId in the URL", () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");

      const result = getProviderIconUrl("0xABC123DEF");

      expect(result).toBe(
        "https://api.example.com/v1/icons/providers/0xabc123def.png",
      );
    });

    it("normalizes trailing slash from API URL", () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/");

      const result = getProviderIconUrl("0xabc123");

      expect(result).toBe(
        "https://api.example.com/v1/icons/providers/0xabc123.png",
      );
      expect(result).not.toContain("//v1");
    });

    it("generates correct URL format for real API URL", () => {
      vi.stubEnv(
        "NEXT_PUBLIC_API_URL",
        "https://staking-api.testnet.babylonlabs.io",
      );

      const result = getProviderIconUrl(
        "0xe650c9bd9be8755cf1df382f668741ab3d1ff11c",
      );

      expect(result).toBe(
        "https://staking-api.testnet.babylonlabs.io/v1/icons/providers/0xe650c9bd9be8755cf1df382f668741ab3d1ff11c.png",
      );
    });
  });
});
