import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: vi.fn(),
    }),
  },
}));

vi.mock("@/config/env", () => ({
  ENV: {
    GRAPHQL_ENDPOINT: "https://indexer.example.com/graphql",
  },
}));

import { ApiError } from "@/utils/errors/types";

import {
  checkGeofencing,
  checkGraphQLEndpoint,
  createEnvConfigError,
  createWagmiInitError,
  fetchHealthCheck,
  runHealthChecks,
} from "../healthCheckService";

describe("healthCheckService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchHealthCheck", () => {
    it("derives health URL from GRAPHQL_ENDPOINT origin", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await fetchHealthCheck();

      expect(fetch).toHaveBeenCalledWith("https://indexer.example.com/health");
    });

    it("resolves on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await expect(fetchHealthCheck()).resolves.toBeUndefined();
    });

    it("throws ApiError with status 451 for geo-blocked response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 451,
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
      } as Response);

      try {
        await fetchHealthCheck();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
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
  });

  describe("checkGeofencing", () => {
    it("returns healthy when healthcheck endpoint succeeds", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await checkGeofencing();

      expect(result.healthy).toBe(true);
      expect(result.isGeoBlocked).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("returns geo-blocked when healthcheck returns 451", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 451,
      } as Response);

      const result = await checkGeofencing();

      expect(result.healthy).toBe(false);
      expect(result.isGeoBlocked).toBe(true);
    });

    it("returns healthy when healthcheck fails with non-451 error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await checkGeofencing();

      // Non-451 errors don't block the user
      expect(result.healthy).toBe(true);
      expect(result.isGeoBlocked).toBe(false);
      expect(result.error).toBeUndefined();
    });
  });

  describe("checkGraphQLEndpoint", () => {
    it("returns healthy when GraphQL endpoint responds with 200", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await checkGraphQLEndpoint();

      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns error when GraphQL endpoint responds with error status", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await checkGraphQLEndpoint();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.title).toBe("Service Unavailable");
    });

    it("returns error when fetch throws (network error)", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const result = await checkGraphQLEndpoint();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.title).toBe("Service Unavailable");
    });
  });

  describe("runHealthChecks", () => {
    it("returns healthy when all checks pass", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
        } as Response);

      const result = await runHealthChecks();

      expect(result.healthy).toBe(true);
      expect(result.isGeoBlocked).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("returns geo-blocked immediately when geofencing check fails with 451", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 451,
      } as Response);

      const result = await runHealthChecks();

      expect(result.healthy).toBe(false);
      expect(result.isGeoBlocked).toBe(true);
      // GraphQL check should not be called (only 1 fetch call)
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("checks GraphQL endpoint after geofencing passes", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as Response);

      const result = await runHealthChecks();

      expect(result.healthy).toBe(false);
      expect(result.isGeoBlocked).toBeUndefined();
      expect(result.error?.title).toBe("Service Unavailable");
    });
  });

  describe("createEnvConfigError", () => {
    it("creates an error with the correct title and message", () => {
      const error = createEnvConfigError("MISSING_VAR_1, MISSING_VAR_2");

      expect(error.title).toBe("Configuration Error");
      expect(error.message).toContain("MISSING_VAR_1, MISSING_VAR_2");
    });
  });

  describe("createWagmiInitError", () => {
    it("creates an error with the correct title", () => {
      const error = createWagmiInitError();

      expect(error.title).toBe("Wallet Configuration Error");
      expect(error.message).toContain("wallet connections");
    });
  });
});
