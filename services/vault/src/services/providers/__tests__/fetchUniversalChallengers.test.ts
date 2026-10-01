import { beforeEach, describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import { fetchAllUniversalChallengers } from "../fetchUniversalChallengers";
import { MAX_ROSTER_PAGES } from "../rosterPagination";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: { request: vi.fn() },
}));

const mockRequest = vi.mocked(graphqlClient.request);

/** A valid 0x address and x-only BTC key, unique per `n`. */
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const btcKey = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

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
      challenger(address(index), btcKey(index), 1),
    );
    fullFirstPage.push(challenger(address(5001), btcKey(5001), 2));
    mockRequest.mockResolvedValueOnce(
      page(fullFirstPage, {
        hasNextPage: true,
        endCursor: "challenger-cursor-1",
      }),
    );
    mockRequest.mockResolvedValueOnce(
      page([challenger(address(5002), btcKey(5002), 2)]),
    );

    const result = await fetchAllUniversalChallengers();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 1000,
      after: "challenger-cursor-1",
    });
    expect(result.latestVersion).toBe(2);
    expect(result.byVersion.get(2)).toEqual([
      { id: address(5001), btcPubKey: btcKey(5001) },
      { id: address(5002), btcPubKey: btcKey(5002) },
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

  it.each([
    ["missing hasNextPage", { endCursor: null }],
    ["null pageInfo", null],
    ["wrong-typed endCursor", { hasNextPage: false, endCursor: 7 }],
  ])("rejects malformed challenger pagination: %s", async (_name, pageInfo) => {
    mockRequest.mockResolvedValueOnce({
      universalChallengerVersions: { items: [], pageInfo },
    });

    const error = await fetchAllUniversalChallengers().catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({
      name: "IncompleteRosterError",
      retryable: false,
    });
    expect(String(error)).toMatch(/malformed roster pagination metadata/);
  });

  it("rejects instead of returning a prefix after the challenger page limit", async () => {
    const continuingPage = page([], {
      hasNextPage: true,
      endCursor: "stuck-cursor",
    });
    mockRequest.mockResolvedValue(continuingPage);

    const error = await fetchAllUniversalChallengers().catch(
      (caught: unknown) => caught,
    );

    expect(mockRequest).toHaveBeenCalledTimes(MAX_ROSTER_PAGES);
    expect(error).toMatchObject({
      name: "IncompleteRosterError",
      retryable: false,
    });
    expect(String(error)).toMatch(/roster exceeds/);
  });

  it.each([
    ["a non-address id", challenger("not-an-address", btcKey(1), 1)],
    ["a non-hex BTC key", challenger(address(1), "not-a-key", 1)],
    ["an empty BTC key", challenger(address(1), "", 1)],
  ])(
    "rejects a challenger row with %s, as keeper rows are",
    async (_name, row) => {
      mockRequest.mockResolvedValueOnce(page([row]));

      const error = await fetchAllUniversalChallengers().catch(
        (caught: unknown) => caught,
      );

      expect(error).toMatchObject({ name: "IncompleteRosterError" });
      expect(String(error)).toMatch(/malformed roster item at index 0/);
    },
  );

  it("rejects a malformed challenger on a continuation page", async () => {
    mockRequest.mockResolvedValueOnce(
      page([], { hasNextPage: true, endCursor: "next" }),
    );
    mockRequest.mockResolvedValueOnce({
      universalChallengerVersions: {
        items: [{ version: 2, challengerInfo: null }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const error = await fetchAllUniversalChallengers().catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({
      name: "IncompleteRosterError",
      retryable: false,
    });
    expect(String(error)).toMatch(/malformed roster item at index 0/);
  });
});
