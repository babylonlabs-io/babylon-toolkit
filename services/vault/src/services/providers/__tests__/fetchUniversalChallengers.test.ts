import { beforeEach, describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import { fetchAllUniversalChallengers } from "../fetchUniversalChallengers";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: { request: vi.fn() },
}));

const mockRequest = vi.mocked(graphqlClient.request);

function challenger(id: string, btcPubKey: string, version: number) {
  return { version, challengerInfo: { id, btcPubKey } };
}

function page(
  items: ReturnType<typeof challenger>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null },
) {
  return { universalChallengerVersions: { items, pageInfo } };
}

describe("fetchAllUniversalChallengers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty version map when the roster is empty", async () => {
    mockRequest.mockResolvedValueOnce(page([]));

    const result = await fetchAllUniversalChallengers();

    expect(result.byVersion.size).toBe(0);
    expect(result.latestVersion).toBe(0);
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
      limit: 1000,
    });
  });

  it("walks challenger pages and returns the complete latest-version set", async () => {
    const fullFirstPage = Array.from({ length: 999 }, (_, index) =>
      challenger(`old-${index}`, `old-key-${index}`, 1),
    );
    fullFirstPage.push(challenger("latest-a", "latest-key-a", 2));
    mockRequest.mockResolvedValueOnce(
      page(fullFirstPage, {
        hasNextPage: true,
        endCursor: "challenger-cursor-1",
      }),
    );
    mockRequest.mockResolvedValueOnce(
      page([challenger("latest-b", "latest-key-b", 2)]),
    );

    const result = await fetchAllUniversalChallengers();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 1000,
      after: "challenger-cursor-1",
    });
    expect(result.latestVersion).toBe(2);
    expect(result.byVersion.get(2)).toEqual([
      { id: "latest-a", btcPubKey: "latest-key-a" },
      { id: "latest-b", btcPubKey: "latest-key-b" },
    ]);
  });

  it("rejects an incomplete challenger roster when another page has no cursor", async () => {
    mockRequest.mockResolvedValueOnce(
      page([], { hasNextPage: true, endCursor: null }),
    );

    const error = await fetchAllUniversalChallengers().catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({
      name: "IncompleteRosterError",
      retryable: false,
    });
    expect(String(error)).toMatch(/another challenger page without a cursor/);
  });
});
