import { describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import { fetchApplications } from "../fetchApplications";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

vi.mock("../../../applications", () => ({
  getApplicationMetadataByController: vi.fn((id: string) => {
    if (id === VALID_ETH_ADDR_WITH_METADATA) {
      return {
        name: "Test App",
        type: "aave",
        description: "A test app",
        logoUrl: "https://example.com/logo.png",
        websiteUrl: "https://example.com",
      };
    }
    return undefined;
  }),
}));

const mockRequest = vi.mocked(graphqlClient.request);

const VALID_ETH_ADDR_WITH_METADATA = "0x" + "a".repeat(40);
const VALID_ETH_ADDR_NO_METADATA = "0x" + "b".repeat(40);

const BASE_APP = {
  registeredAt: "2024-01-01T00:00:00Z",
  blockNumber: "100",
  transactionHash: "0x" + "f".repeat(64),
};

describe("fetchApplications", () => {
  it("returns apps that have registry metadata", async () => {
    mockRequest.mockResolvedValueOnce({
      applications: {
        items: [
          { id: VALID_ETH_ADDR_WITH_METADATA, name: "Indexer Name", ...BASE_APP },
        ],
      },
    });

    const result = await fetchApplications();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_ETH_ADDR_WITH_METADATA);
    expect(result[0].name).toBe("Indexer Name");
  });

  it("skips apps with no registry metadata", async () => {
    mockRequest.mockResolvedValueOnce({
      applications: {
        items: [
          { id: VALID_ETH_ADDR_NO_METADATA, name: null, ...BASE_APP },
        ],
      },
    });

    const result = await fetchApplications();

    expect(result).toHaveLength(0);
  });

  it("skips an app with an invalid ETH address and warns", async () => {
    mockRequest.mockResolvedValueOnce({
      applications: {
        items: [
          { id: "not-an-address", name: null, ...BASE_APP },
          { id: VALID_ETH_ADDR_WITH_METADATA, name: "Good App", ...BASE_APP },
        ],
      },
    });

    const { logger } = await import("@/infrastructure");
    const result = await fetchApplications();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_ETH_ADDR_WITH_METADATA);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid id"),
    );
  });

  it("falls back to registry name when indexer name is null", async () => {
    mockRequest.mockResolvedValueOnce({
      applications: {
        items: [
          { id: VALID_ETH_ADDR_WITH_METADATA, name: null, ...BASE_APP },
        ],
      },
    });

    const result = await fetchApplications();

    expect(result[0].name).toBe("Test App");
  });
});
