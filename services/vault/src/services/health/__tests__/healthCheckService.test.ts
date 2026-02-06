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
    GRAPHQL_ENDPOINT: "https://test.graphql.endpoint",
  },
}));

const mockFetchHealthCheck = vi.fn();

vi.mock("@/api", async () => {
  class MockApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  return {
    fetchHealthCheck: () => mockFetchHealthCheck(),
    isError451: (error: unknown) => {
      if (typeof error === "object" && error !== null && "status" in error) {
        return (error as { status: number }).status === 451;
      }
      return false;
    },
    ApiError: MockApiError,
  };
});

import { ApiError } from "@/api";

import {
  checkGeofencing,
  checkGraphQLEndpoint,
  createEnvConfigError,
  createWagmiInitError,
  runHealthChecks,
} from "../healthCheckService";

describe("healthCheckService", () => {
  describe("checkGraphQLEndpoint", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

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

  describe("checkGeofencing", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns healthy when healthcheck endpoint succeeds", async () => {
      mockFetchHealthCheck.mockResolvedValueOnce({ data: "ok" });

      const result = await checkGeofencing();

      expect(result.healthy).toBe(true);
      expect(result.isGeoBlocked).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("returns geo-blocked when healthcheck returns 451", async () => {
      const error = new ApiError("Geo blocked", 451);
      mockFetchHealthCheck.mockRejectedValueOnce(error);

      const result = await checkGeofencing();

      expect(result.healthy).toBe(false);
      expect(result.isGeoBlocked).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error?.title).toBe("Access Restricted");
    });

    it("returns healthy when healthcheck fails with non-451 error", async () => {
      mockFetchHealthCheck.mockRejectedValueOnce(new Error("Network error"));

      const result = await checkGeofencing();

      // Non-451 errors don't block the user
      expect(result.healthy).toBe(true);
      expect(result.isGeoBlocked).toBe(false);
      expect(result.error).toBeUndefined();
    });
  });

  describe("runHealthChecks", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns healthy when all checks pass", async () => {
      mockFetchHealthCheck.mockResolvedValueOnce({ data: "ok" });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await runHealthChecks();

      expect(result.healthy).toBe(true);
      expect(result.isGeoBlocked).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("returns geo-blocked immediately when geofencing check fails with 451", async () => {
      const error = new ApiError("Geo blocked", 451);
      mockFetchHealthCheck.mockRejectedValueOnce(error);

      const result = await runHealthChecks();

      expect(result.healthy).toBe(false);
      expect(result.isGeoBlocked).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error?.title).toBe("Access Restricted");
      // GraphQL check should not be called
      expect(fetch).not.toHaveBeenCalled();
    });

    it("checks GraphQL endpoint after geofencing passes", async () => {
      mockFetchHealthCheck.mockResolvedValueOnce({ data: "ok" });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await runHealthChecks();

      expect(result.healthy).toBe(false);
      expect(result.isGeoBlocked).toBeUndefined();
      expect(result.error?.title).toBe("Service Unavailable");
    });

    it("runs checks in correct order: geofencing first, then GraphQL", async () => {
      mockFetchHealthCheck.mockResolvedValueOnce({ data: "ok" });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await runHealthChecks();

      // Verify geofencing (mockFetchHealthCheck) was called
      expect(mockFetchHealthCheck).toHaveBeenCalledTimes(1);
      // Verify GraphQL (fetch) was called after
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("does not run GraphQL check when geo-blocked", async () => {
      const error = new ApiError("Geo blocked", 451);
      mockFetchHealthCheck.mockRejectedValueOnce(error);

      await runHealthChecks();

      expect(mockFetchHealthCheck).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sets isGeoBlocked to false when healthy", async () => {
      mockFetchHealthCheck.mockResolvedValueOnce({ data: "ok" });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await runHealthChecks();

      expect(result.isGeoBlocked).toBe(false);
    });
  });
});
