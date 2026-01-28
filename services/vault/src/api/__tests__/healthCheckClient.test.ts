import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    GRAPHQL_ENDPOINT: "https://indexer.example.com/graphql",
  },
}));

import { fetchHealthCheck } from "../healthCheckClient";
import { ApiError } from "../types";

describe("healthCheckClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("URL construction", () => {
    it("derives health URL from GRAPHQL_ENDPOINT origin", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "ok" }),
      } as Response);

      await fetchHealthCheck();

      expect(fetch).toHaveBeenCalledWith("https://indexer.example.com/health");
    });
  });

  describe("successful responses", () => {
    it("returns data on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "healthy" }),
      } as Response);

      const result = await fetchHealthCheck();

      expect(result).toEqual({ data: "healthy" });
    });
  });

  describe("error handling", () => {
    it("throws ApiError with status 451 for geo-blocked response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 451,
        text: () => Promise.resolve("Unavailable For Legal Reasons"),
      } as Response);

      try {
        await fetchHealthCheck();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(451);
        expect((error as ApiError).message).toBe("Health check failed");
      }
    });

    it("throws ApiError with status for non-ok response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as Response);

      try {
        await fetchHealthCheck();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).response).toBe("Internal Server Error");
      }
    });

    it("uses fallback message when response.text() fails", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error("Failed to read body")),
      } as Response);

      try {
        await fetchHealthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).response).toBe("Health check failed");
      }
    });

    it("throws ApiError for TypeError (network error)", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      try {
        await fetchHealthCheck();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(0);
        expect((error as ApiError).message).toBe("Network error occurred");
      }
    });

    it("re-throws ApiError if already an ApiError", async () => {
      const existingError = new ApiError("Existing error", 400, "Bad Request");
      vi.mocked(fetch).mockRejectedValueOnce(existingError);

      try {
        await fetchHealthCheck();
      } catch (error) {
        expect(error).toBe(existingError);
        expect((error as ApiError).message).toBe("Existing error");
        expect((error as ApiError).status).toBe(400);
      }
    });

    it("handles unknown error types", async () => {
      vi.mocked(fetch).mockRejectedValueOnce("Unknown error string");

      try {
        await fetchHealthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe("Health check failed");
        expect((error as ApiError).status).toBe(0);
      }
    });
  });
});
