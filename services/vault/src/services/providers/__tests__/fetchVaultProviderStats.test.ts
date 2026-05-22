import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../../clients/graphql/client";
import { fetchVaultProviderStats } from "../fetchVaultProviderStats";

vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: { request: vi.fn() },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

const mockRequest = vi.mocked(graphqlClient.request);
const mockWarn = vi.mocked(logger.warn);

/** Build a `vaults` response with a matching `totalCount` (not truncated). */
function vaultsResponse(
  items: Array<{ amount: string; status: string; activatedAt: string | null }>,
) {
  return { vaults: { items, totalCount: items.length } };
}

describe("fetchVaultProviderStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums the amounts of active vaults into totalActiveSats", async () => {
    mockRequest.mockResolvedValue(
      vaultsResponse([
        { amount: "100", status: "available", activatedAt: "1000" },
        { amount: "250", status: "available", activatedAt: "2000" },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.totalActiveSats).toBe(350n);
  });

  it("excludes non-active vaults from totalActiveSats", async () => {
    mockRequest.mockResolvedValue(
      vaultsResponse([
        { amount: "100", status: "available", activatedAt: "1000" },
        { amount: "999", status: "redeemed", activatedAt: "2000" },
        { amount: "888", status: "pending", activatedAt: null },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.totalActiveSats).toBe(100n);
  });

  it("reports the most recent activatedAt (in ms) as lastSuccessfulPeginAt", async () => {
    mockRequest.mockResolvedValue(
      vaultsResponse([
        { amount: "1", status: "available", activatedAt: "1700" },
        { amount: "1", status: "available", activatedAt: "1900" },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    // Indexer timestamps are unix seconds; the stat is milliseconds.
    expect(stats.get("0xvp")?.lastSuccessfulPeginAt).toBe(1_900_000);
  });

  it("counts an activated vault that is no longer active toward the last peg-in", async () => {
    mockRequest.mockResolvedValue(
      vaultsResponse([
        { amount: "1", status: "available", activatedAt: "1000" },
        { amount: "1", status: "redeemed", activatedAt: "5000" },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.lastSuccessfulPeginAt).toBe(5_000_000);
  });

  it("leaves lastSuccessfulPeginAt undefined when no vault was ever activated", async () => {
    mockRequest.mockResolvedValue(
      vaultsResponse([
        { amount: "10", status: "pending", activatedAt: null },
        { amount: "20", status: "verified", activatedAt: null },
      ]),
    );

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.lastSuccessfulPeginAt).toBeUndefined();
    expect(stats.get("0xvp")?.totalActiveSats).toBe(0n);
  });

  it("isolates a failed VP query so other VPs still resolve", async () => {
    mockRequest.mockImplementation((_query, variables) => {
      const vp = (variables as { vaultProvider: string }).vaultProvider;
      if (vp === "0xbroken") {
        return Promise.reject(new Error("indexer unavailable"));
      }
      return Promise.resolve(
        vaultsResponse([
          { amount: "777", status: "available", activatedAt: "100" },
        ]),
      );
    });

    const stats = await fetchVaultProviderStats(["0xBroken", "0xGood"]);

    expect(stats.has("0xbroken")).toBe(false);
    expect(stats.get("0xgood")?.totalActiveSats).toBe(777n);
  });

  it("warns and still aggregates when the indexer truncates the result", async () => {
    mockRequest.mockResolvedValue({
      vaults: {
        items: [{ amount: "100", status: "available", activatedAt: "1000" }],
        totalCount: 5,
      },
    });

    const stats = await fetchVaultProviderStats(["0xVP"]);

    expect(stats.get("0xvp")?.totalActiveSats).toBe(100n);
    expect(mockWarn).toHaveBeenCalled();
  });
});
