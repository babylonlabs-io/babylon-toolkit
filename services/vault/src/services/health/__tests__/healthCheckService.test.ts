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

vi.mock(
  "../../applications/morpho/clients/morpho-controller/abis/MorphoIntegrationController.abi.json",
  () => ({
    default: [],
  }),
);

import {
  checkGraphQLEndpoint,
  createEnvConfigError,
  createWagmiInitError,
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
});
