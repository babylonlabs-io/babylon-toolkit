import { beforeEach, describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql/client";
import { fetchVaultProviderStats } from "../fetchVaultProviderStats";

vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: { request: vi.fn() },
}));

const mockRequest = vi.mocked(graphqlClient.request);

type Item = {
  vaultProvider: string;
  amount: string;
  status: string;
  activatedAt: string;
};

/** Build a single-page `vaults` response (no further pages to walk). */
function page(items: Item[]) {
  return {
    vaults: { items, pageInfo: { hasNextPage: false, endCursor: null } },
  };
}

/** Build a `vaults` page that reports another page after it. */
function pageWithNext(items: Item[], endCursor: string | null) {
  return { vaults: { items, pageInfo: { hasNextPage: true, endCursor } } };
}

describe("fetchVaultProviderStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums the amounts of active vaults into totalActiveSats", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xvp",
          amount: "100",
          status: "available",
          activatedAt: "1000",
        },
        {
          vaultProvider: "0xvp",
          amount: "250",
          status: "available",
          activatedAt: "2000",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.totalActiveSats).toBe(350n);
  });

  it("excludes vaults that are no longer active from totalActiveSats", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xvp",
          amount: "100",
          status: "available",
          activatedAt: "1000",
        },
        {
          vaultProvider: "0xvp",
          amount: "999",
          status: "redeemed",
          activatedAt: "2000",
        },
        {
          vaultProvider: "0xvp",
          amount: "888",
          status: "liquidated",
          activatedAt: "3000",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.totalActiveSats).toBe(100n);
  });

  it("reports the most recent activatedAt (in ms) as lastSuccessfulPeginAt", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xvp",
          amount: "1",
          status: "available",
          activatedAt: "1700",
        },
        {
          vaultProvider: "0xvp",
          amount: "1",
          status: "available",
          activatedAt: "1900",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    // Indexer timestamps are unix seconds; the stat is milliseconds.
    expect(stats.get("0xvp")?.lastSuccessfulPeginAt).toBe(1_900_000);
  });

  it("counts an activated vault that is no longer active toward the last peg-in", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xvp",
          amount: "1",
          status: "available",
          activatedAt: "1000",
        },
        {
          vaultProvider: "0xvp",
          amount: "1",
          status: "redeemed",
          activatedAt: "5000",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.lastSuccessfulPeginAt).toBe(5_000_000);
  });

  it("reports a provider with no activated vaults as zero rather than omitting it", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xa",
          amount: "100",
          status: "available",
          activatedAt: "1000",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xA", "0xQuiet"]);

    // Absent from the map means "unknown" at the call site and renders a
    // placeholder; a VP the indexer returns nothing for genuinely holds zero.
    expect(stats.get("0xquiet")?.totalActiveSats).toBe(0n);
    expect(stats.get("0xquiet")?.lastSuccessfulPeginAt).toBeUndefined();
  });

  it("fetches every provider in one request and groups the rows by provider", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xa",
          amount: "100",
          status: "available",
          activatedAt: "1000",
        },
        {
          vaultProvider: "0xb",
          amount: "700",
          status: "available",
          activatedAt: "2000",
        },
        {
          vaultProvider: "0xa",
          amount: "50",
          status: "available",
          activatedAt: "3000",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xA", "0xB"]);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(stats.get("0xa")?.totalActiveSats).toBe(150n);
    expect(stats.get("0xb")?.totalActiveSats).toBe(700n);
  });

  it("passes every requested provider, lowercased, as the filter", async () => {
    mockRequest.mockResolvedValue(page([]));

    await fetchVaultProviderStats(["0xAbC", "0xDeF"]);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          vaultProviders: ["0xabc", "0xdef"],
        }),
      }),
    );
  });

  it("forwards the caller's abort signal to the request", async () => {
    mockRequest.mockResolvedValue(page([]));
    const controller = new AbortController();

    await fetchVaultProviderStats(["0xA"], controller.signal);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("walks every page and totals across them", async () => {
    mockRequest.mockResolvedValueOnce(
      pageWithNext(
        [
          {
            vaultProvider: "0xa",
            amount: "100",
            status: "available",
            activatedAt: "1000",
          },
        ],
        "cursor-1",
      ),
    );
    mockRequest.mockResolvedValueOnce(
      page([
        {
          vaultProvider: "0xa",
          amount: "300",
          status: "available",
          activatedAt: "4000",
        },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xA"]);

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ after: "cursor-1" }),
      }),
    );
    expect(stats.get("0xa")?.totalActiveSats).toBe(400n);
    expect(stats.get("0xa")?.lastSuccessfulPeginAt).toBe(4_000_000);
  });

  it("rejects when the query fails, so the caller can retry instead of showing zeros", async () => {
    mockRequest.mockRejectedValue(new Error("indexer unavailable"));

    // Resolving with an empty map would look like a successful fetch and the
    // caller's react-query retry would never fire.
    await expect(fetchVaultProviderStats(["0xA", "0xB"])).rejects.toThrow(
      "indexer unavailable",
    );
  });

  it("rejects when a later page fails rather than returning the pages it already has", async () => {
    mockRequest.mockResolvedValueOnce(
      pageWithNext(
        [
          {
            vaultProvider: "0xa",
            amount: "100",
            status: "available",
            activatedAt: "1000",
          },
        ],
        "cursor-1",
      ),
    );
    mockRequest.mockRejectedValueOnce(new Error("indexer unavailable"));

    // The first page's 100 sats are real but incomplete; surfacing them would
    // render a confident wrong total.
    await expect(fetchVaultProviderStats(["0xA"])).rejects.toThrow(
      "indexer unavailable",
    );
  });

  it("rejects when the indexer promises another page but returns no cursor", async () => {
    mockRequest.mockResolvedValue(
      pageWithNext(
        [
          {
            vaultProvider: "0xa",
            amount: "100",
            status: "available",
            activatedAt: "1000",
          },
        ],
        null,
      ),
    );

    await expect(fetchVaultProviderStats(["0xA"])).rejects.toThrow(
      /no cursor after page 1/,
    );
  });

  it("rejects on a malformed amount rather than dropping the provider", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xa",
          amount: "not-a-number",
          status: "available",
          activatedAt: "1000",
        },
      ]),
    );

    await expect(fetchVaultProviderStats(["0xA"])).rejects.toThrow(
      /non-numeric amount/,
    );
  });

  it("rejects on a malformed activatedAt rather than under-reporting the last peg-in", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xa",
          amount: "100",
          status: "available",
          activatedAt: "1700x",
        },
      ]),
    );

    // parseInt would have read "1700x" as 1700; a silently wrong timestamp
    // sinks the provider in the sort with nothing to say why.
    await expect(fetchVaultProviderStats(["0xA"])).rejects.toThrow(
      /non-numeric activatedAt/,
    );
  });

  it("rejects an activatedAt beyond the safe integer range rather than rounding it", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xa",
          amount: "100",
          status: "available",
          activatedAt: "99999999999999999999",
        },
      ]),
    );

    // All digits, so it passes the format check, but Number() can no longer
    // represent it exactly — a rounded timestamp would silently reorder the
    // provider list.
    await expect(fetchVaultProviderStats(["0xA"])).rejects.toThrow(
      /out-of-range activatedAt/,
    );
  });

  it("rejects when a row belongs to a provider that was not requested", async () => {
    mockRequest.mockResolvedValue(
      page([
        {
          vaultProvider: "0xstranger",
          amount: "100",
          status: "available",
          activatedAt: "1000",
        },
      ]),
    );

    // The filter guarantees the set; a stray row means it is not being
    // applied, and the walk would otherwise pull the whole protocol.
    await expect(fetchVaultProviderStats(["0xA"])).rejects.toThrow(
      /unrequested provider 0xstranger/,
    );
  });

  it("issues no request when asked for no providers", async () => {
    const stats = await fetchVaultProviderStats([]);

    expect(mockRequest).not.toHaveBeenCalled();
    expect(stats.size).toBe(0);
  });
});
