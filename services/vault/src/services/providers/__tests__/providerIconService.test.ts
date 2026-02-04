import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProviderIconUrl } from "../providerIconService";

vi.mock("@/config", () => ({
  ENV: { API_URL: "" },
}));

import { ENV } from "@/config";

describe("providerIconService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProviderIconUrl", () => {
    it("returns undefined when API URL is not configured", () => {
      ENV.API_URL = "";

      expect(getProviderIconUrl("0xABC123")).toBeUndefined();
    });

    it("returns undefined when providerId is empty", () => {
      ENV.API_URL = "https://api.example.com";

      expect(getProviderIconUrl("")).toBeUndefined();
    });

    it("lowercases the providerId in the URL", () => {
      ENV.API_URL = "https://api.example.com";

      const result = getProviderIconUrl("0xABC123DEF");

      expect(result).toBe(
        "https://api.example.com/v1/icons/providers/0xabc123def.png",
      );
    });

    it("generates correct URL format for real API URL", () => {
      ENV.API_URL = "https://staking-api.testnet.babylonlabs.io";

      const result = getProviderIconUrl(
        "0xe650c9bd9be8755cf1df382f668741ab3d1ff11c",
      );

      expect(result).toBe(
        "https://staking-api.testnet.babylonlabs.io/v1/icons/providers/0xe650c9bd9be8755cf1df382f668741ab3d1ff11c.png",
      );
    });
  });
});
