import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequest, mockGetPosition, mockGetUserPositionWithAccountData } =
  vi.hoisted(() => ({
    mockRequest: vi.fn(),
    mockGetPosition: vi.fn(),
    mockGetUserPositionWithAccountData: vi.fn(),
  }));

vi.mock("@/clients/graphql", () => ({
  graphqlClient: { request: mockRequest },
}));
vi.mock(
  "@babylonlabs-io/ts-sdk/tbv/integrations/aave",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@babylonlabs-io/ts-sdk/tbv/integrations/aave")
    >()),
    getPosition: mockGetPosition,
  }),
);
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => ({}) },
}));
vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => "0x" + "a".repeat(40),
}));
vi.mock("../../clients", () => ({
  AaveSpoke: {
    getUserPositionWithAccountData: mockGetUserPositionWithAccountData,
  },
}));

import { fetchAaveActivePositionsWithCollaterals } from "../fetchPositions";
import { getUserPositionsWithLiveData } from "../positionService";

const DEPOSITOR = "0x" + "1".repeat(40);
const PROXY = "0x" + "3".repeat(40);
const SPOKE = ("0x" + "2".repeat(40)) as `0x${string}`;
const PAGE_SIZE = 1000;

function collateralRow(index: number, removed: boolean) {
  const vaultId = "0x" + index.toString(16).padStart(64, "0");
  return {
    depositorAddress: DEPOSITOR,
    vaultId,
    amount: "100",
    addedAt: "1",
    removedAt: removed ? "2" : null,
    liquidationIndex: String(index),
    vault: {
      id: vaultId,
      peginTxHash: "0x" + "b".repeat(64),
      amount: "100",
      status: removed ? "depositor_withdrawn" : "active",
      vaultProvider: "0x" + "4".repeat(40),
      inUse: !removed,
      depositorBtcPubKey: "c".repeat(64),
      depositorPayoutBtcAddress: "0x0014" + "d".repeat(40),
    },
  };
}

// One full page of withdrawn rows, then the three live rows on page two.
const TOMBSTONES = Array.from({ length: PAGE_SIZE }, (_, i) =>
  collateralRow(i, true),
);
const LIVE_ROWS = [PAGE_SIZE, PAGE_SIZE + 1, PAGE_SIZE + 2].map((i) =>
  collateralRow(i, false),
);
const LIVE_VAULT_IDS = LIVE_ROWS.map((row) => row.vaultId);

function serveIndexer(pages: Record<string, unknown>) {
  mockRequest.mockImplementation(
    async (_document: unknown, variables: { after?: string | null }) => {
      if (!("limit" in variables)) {
        return {
          aavePositions: {
            items: [
              {
                depositorAddress: DEPOSITOR,
                proxyContract: PROXY,
                totalCollateral: "300",
                createdAt: "1",
                updatedAt: "2",
              },
            ],
          },
        };
      }
      return { aavePositionCollaterals: pages[variables.after ?? "first"] };
    },
  );
}

describe("fetchAaveActivePositionsWithCollaterals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveIndexer({
      first: {
        items: TOMBSTONES,
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
      "cursor-1": {
        items: LIVE_ROWS,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    mockGetPosition.mockResolvedValue({
      proxyContract: PROXY,
      vaultIds: LIVE_VAULT_IDS,
      totalCollateralBTC: 300n,
    });
    mockGetUserPositionWithAccountData.mockResolvedValue({
      position: {
        drawnShares: 0n,
        premiumShares: 0n,
        suppliedShares: 0n,
        dynamicConfigKey: 0,
      },
      accountData: { borrowCount: 0n },
    });
  });

  it("returns live collateral rows that sit past a full page of withdrawn rows", async () => {
    const [position] = await fetchAaveActivePositionsWithCollaterals(DEPOSITOR);

    const liveIds = position.collaterals
      .filter((row) => row.removedAt === null)
      .map((row) => row.vaultId);
    expect(liveIds).toEqual(LIVE_VAULT_IDS);
    expect(position.collaterals).toHaveLength(PAGE_SIZE + 3);
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
      depositorAddress: DEPOSITOR,
      limit: PAGE_SIZE,
      after: "cursor-1",
    });
  });

  it("reports no indexer error for a chain position whose live rows are on a later page", async () => {
    const [position] = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      vbtcReserveId: 1n,
    });

    expect(position.indexerError).toBeUndefined();
  });

  it("throws when the indexer reports another page without a cursor", async () => {
    serveIndexer({
      first: {
        items: TOMBSTONES,
        pageInfo: { hasNextPage: true, endCursor: null },
      },
    });

    await expect(
      fetchAaveActivePositionsWithCollaterals(DEPOSITOR),
    ).rejects.toThrow(/no cursor after page 1/);
  });

  it("throws instead of returning a partial list when the indexer keeps reporting more pages", async () => {
    mockRequest.mockImplementation(async (_document, variables) =>
      "limit" in variables
        ? {
            aavePositionCollaterals: {
              items: [],
              pageInfo: { hasNextPage: true, endCursor: "cursor-next" },
            },
          }
        : { aavePositions: { items: [] } },
    );

    await expect(
      fetchAaveActivePositionsWithCollaterals(DEPOSITOR),
    ).rejects.toThrow(/More than 50000 collateral rows/);
  });
});
