import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLogos } from "../logoClient";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { SIDECAR_API_URL: "" },
}));
vi.mock("../../../config/env", () => ({
  ENV: mockEnv,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("logoClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("fetchLogos", () => {
    it("returns empty object when SIDECAR_API_URL is not configured", async () => {
      mockEnv.SIDECAR_API_URL = "";

      const result = await fetchLogos(["identity1"]);

      expect(result).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns empty object when identities array is empty", async () => {
      mockEnv.SIDECAR_API_URL = "https://sidecar-api.example.com";

      const result = await fetchLogos([]);

      expect(result).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fetches logos from sidecar API with POST request", async () => {
      mockEnv.SIDECAR_API_URL = "https://sidecar-api.example.com";
      const mockResponse = {
        identity1: "https://s3-bucket/logo1.png",
        identity2: "https://s3-bucket/logo2.png",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await fetchLogos(["identity1", "identity2"]);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://sidecar-api.example.com/logo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ identities: ["identity1", "identity2"] }),
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("returns empty object when API returns error", async () => {
      mockEnv.SIDECAR_API_URL = "https://sidecar-api.example.com";
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await fetchLogos(["identity1"]);

      expect(result).toEqual({});
    });

    it("returns empty object when fetch throws", async () => {
      mockEnv.SIDECAR_API_URL = "https://sidecar-api.example.com";
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await fetchLogos(["identity1"]);

      expect(result).toEqual({});
    });

    it("handles identities not found in response", async () => {
      mockEnv.SIDECAR_API_URL = "https://sidecar-api.example.com";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ identity1: "https://s3-bucket/logo1.png" }),
      });

      const result = await fetchLogos(["identity1", "identity2"]);

      expect(result).toEqual({ identity1: "https://s3-bucket/logo1.png" });
    });
  });
});
