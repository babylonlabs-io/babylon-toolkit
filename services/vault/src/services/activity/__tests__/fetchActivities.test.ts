import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityLog, ActivityRow } from "@/types/activityLog";

import {
  __resetWarnedUnknownTypesForTests,
  fetchUserActivities,
  type FetchUserActivitiesDeps,
} from "../fetchActivities";

/** Narrow an ActivityRow to a standalone ActivityLog, failing the test loudly
 *  if the row was rolled into a LiquidationGroupRow. */
function asStandard(row: ActivityRow): ActivityLog {
  if (row.kind !== "row") {
    throw new Error(`Expected standalone row, got ${row.kind}`);
  }
  return row;
}

vi.mock("@/clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({
    coinSymbol: "sBTC",
    icon: "/images/btc.svg",
  }),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const USER = "0x1111111111111111111111111111111111111111";
const VAULT_A = "0x" + "a".repeat(64);
const TX_DEPOSIT = "0x" + "1".repeat(64);
const TX_BORROW = "0x" + "4".repeat(64);

const RESERVE_ICON = "test://icon.svg";

type RawActivity = {
  id: string;
  vaultId: string | null;
  depositor: string;
  type: string;
  amount: string;
  debtReserveId: string | null;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
};

type ActivityOverrides = Partial<Omit<RawActivity, "id">> & {
  logIndex?: number;
};

function activity(overrides: ActivityOverrides): RawActivity {
  const { logIndex = 0, ...rest } = overrides;
  const base: RawActivity = {
    id: "",
    vaultId: VAULT_A,
    depositor: USER,
    type: "deposit",
    amount: "1000000", // 0.01 sBTC at 8 decimals
    debtReserveId: null,
    timestamp: "1700000000",
    blockNumber: "100",
    transactionHash: TX_DEPOSIT,
    ...rest,
  };
  base.id = `${base.transactionHash}-${logIndex}-${base.type}`;
  return base;
}

function buildDeps(
  reserves: Array<{ id: string; symbol: string; decimals: number }> = [],
): FetchUserActivitiesDeps {
  const reserveMap = new Map<
    string,
    { symbol: string; decimals: number; icon: string | undefined }
  >();
  for (const r of reserves) {
    reserveMap.set(r.id, {
      symbol: r.symbol,
      decimals: r.decimals,
      icon: RESERVE_ICON,
    });
  }
  return {
    reserves: reserveMap,
  };
}

/**
 * Mocks both pagination queries against the same source array.
 *
 * - `GetActivitiesFirstPage` returns the (already desc-sorted) rows plus the
 *   bounded `vaults` selection.
 * - `GetActivitiesNextPage` returns an empty page; tests that want to exercise
 *   the cursor loop should override this with `setupPaginatedGraphqlMock`.
 */
async function setupGraphqlMock(rows: RawActivity[]) {
  const { graphqlClient } = await import("@/clients/graphql");
  vi.mocked(graphqlClient.request).mockImplementation(
    async (query: unknown) => {
      const src = String(query);
      if (src.includes("GetActivitiesFirstPage")) {
        const ids = Array.from(
          new Set(
            rows.map((a) => a.vaultId).filter((v): v is string => v != null),
          ),
        );
        return {
          vaultActivitys: {
            items: rows,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          vaults: {
            items: ids.map((id) => ({
              id,
              peginTxHash: `0xpegin-${id.slice(2, 10)}`,
              vaultProvider: `0xvp-${id.slice(2, 10)}`,
            })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as never;
      }
      if (src.includes("GetActivitiesNextPage")) {
        return {
          vaultActivitys: {
            items: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as never;
      }
      if (src.includes("GetVaultsNextPage")) {
        return {
          vaults: {
            items: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as never;
      }
      throw new Error(`Unexpected query: ${src}`);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetWarnedUnknownTypesForTests();
});

describe("fetchUserActivities type mapping", () => {
  it("maps every emitted indexer type to its display label", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: "0x" + "a".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "withdrawal",
        logIndex: 0,
        transactionHash: "0x" + "b".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "liquidation",
        logIndex: 0,
        transactionHash: "0x" + "e".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: "0x" + "f".repeat(64),
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
      activity({
        type: "repay",
        logIndex: 1,
        transactionHash: "0x" + "f".repeat(64),
        vaultId: null,
        debtReserveId: "1",
        amount: "500000",
      }),
      activity({
        type: "redeem",
        logIndex: 0,
        transactionHash: "0x" + "9".repeat(64),
        vaultId: VAULT_A,
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([{ id: "1", symbol: "USDC", decimals: 6 }]),
    );
    const types = result.map((r) => r.type);

    expect(types).toEqual(
      expect.arrayContaining([
        "Deposit",
        "Withdraw",
        "Fully Liquidated",
        "Borrow",
        "Repay",
        "Redeem",
      ]),
    );
    expect(result).toHaveLength(6);
  });

  it("drops unrecognised types instead of crashing the tab", async () => {
    const { logger } = await import("@/infrastructure");
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: "0x" + "a".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "add_collateral",
        logIndex: 1,
        transactionHash: "0x" + "a".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "add_collateral",
        logIndex: 2,
        transactionHash: "0x" + "b".repeat(64),
        vaultId: VAULT_A,
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("Deposit");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("dropped unrecognised activity type"),
      { type: "add_collateral" },
    );
  });

  it("requests vaultProvider in the vaults selection", async () => {
    const { graphqlClient } = await import("@/clients/graphql");
    const requestMock = vi.mocked(graphqlClient.request);
    requestMock.mockReset();
    requestMock.mockResolvedValueOnce({
      vaultActivitys: {
        items: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      vaults: {
        items: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    } as never);

    await fetchUserActivities(USER as `0x${string}`, buildDeps());

    const firstCallQuery = String(requestMock.mock.calls[0]?.[0]);
    expect(firstCallQuery).toMatch(/vaultProvider/);
  });

  it("warns only once per unknown type across repeated fetches", async () => {
    const { logger } = await import("@/infrastructure");
    const rows: RawActivity[] = [
      activity({
        type: "add_collateral",
        logIndex: 0,
        transactionHash: "0x" + "c".repeat(64),
        vaultId: VAULT_A,
      }),
    ];
    await setupGraphqlMock(rows);

    await fetchUserActivities(USER as `0x${string}`, buildDeps());
    await fetchUserActivities(USER as `0x${string}`, buildDeps());

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("fetchUserActivities position-scoped enrichment", () => {
  it("formats borrow amount with reserve decimals, not BTC decimals", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1500000000", // 1500.000000 USDC at 6 decimals
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([{ id: "1", symbol: "USDC", decimals: 6 }]),
    );
    expect(result).toHaveLength(1);
    expect(asStandard(result[0]).amount.symbol).toBe("USDC");
    expect(asStandard(result[0]).amount.value).toBe("1,500");
  });

  it("formats high-decimals tokens without JS number precision loss", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        // 12,345,678.123456789012345678 DAI at 18 decimals
        amount: "12345678123456789012345678",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([{ id: "1", symbol: "DAI", decimals: 18 }]),
    );
    expect(asStandard(result[0]).amount.symbol).toBe("DAI");
    // Integer part must be exact (parseFloat would have lost precision here).
    // Fractional part is capped at MAX_DISPLAY_FRACTION_DIGITS = 8.
    expect(asStandard(result[0]).amount.value).toBe("12,345,678.12345678");
  });

  it("degrades gracefully when a borrow row has no debtReserveId", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: null,
        amount: "1000000",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );
    expect(result).toHaveLength(1);
    expect(asStandard(result[0]).type).toBe("Borrow");
    expect(asStandard(result[0]).amount.symbol).toBe("—");
    // When decimals aren't known, surface the raw amount string rather than
    // blanking the whole Activity tab.
    expect(asStandard(result[0]).amount.value).toBe("1000000");
  });

  it("degrades gracefully when an injected reserve is missing", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
    ];
    await setupGraphqlMock(rows);

    // Caller did not include reserve id "1".
    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );
    expect(result).toHaveLength(1);
    expect(asStandard(result[0]).amount.symbol).toBe("—");
    expect(asStandard(result[0]).amount.value).toBe("1000000");
  });
});

describe("fetchUserActivities tokenIcon", () => {
  it("uses the BTC icon for native-type rows (deposit, withdrawal, redeem, claim_expired)", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: "0x" + "a".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "withdrawal",
        logIndex: 0,
        transactionHash: "0x" + "b".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "redeem",
        logIndex: 0,
        transactionHash: "0x" + "d".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "claim_expired",
        logIndex: 0,
        transactionHash: "0x" + "e".repeat(64),
        vaultId: VAULT_A,
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    expect(result).toHaveLength(4);
    for (const row of result) {
      expect(asStandard(row).tokenIcon).toBe("/images/btc.svg");
    }
  });

  it("uses the reserve icon for borrow/repay rows", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
      activity({
        type: "repay",
        logIndex: 1,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "500000",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([{ id: "1", symbol: "USDC", decimals: 6 }]),
    );

    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(asStandard(row).tokenIcon).toBe(RESERVE_ICON);
    }
  });

  it("falls back to empty tokenIcon when reserve missing", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    expect(result).toHaveLength(1);
    expect(asStandard(result[0]).type).toBe("Borrow");
    expect(asStandard(result[0]).tokenIcon).toBe("");
  });
});

describe("fetchUserActivities GraphQL request shape", () => {
  it("issues exactly one GraphQL request that returns activities + vaults together", async () => {
    const { graphqlClient } = await import("@/clients/graphql");

    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
      }),
      activity({
        type: "borrow",
        logIndex: 1,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
    ];
    await setupGraphqlMock(rows);

    await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([{ id: "1", symbol: "USDC", decimals: 6 }]),
    );

    expect(vi.mocked(graphqlClient.request)).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(graphqlClient.request).mock.calls[0];
    expect(String(query)).toContain("GetActivitiesFirstPage");
  });

  it("paginates with cursor until the indexer reports no more pages", async () => {
    const { graphqlClient } = await import("@/clients/graphql");

    const pageOne: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
      }),
    ];
    const pageTwo: RawActivity[] = [
      activity({
        type: "withdrawal",
        logIndex: 0,
        transactionHash: "0xwithdraw",
        vaultId: VAULT_A,
      }),
    ];

    vi.mocked(graphqlClient.request).mockImplementation(
      async (query: unknown, variables?: unknown) => {
        const src = String(query);
        if (src.includes("GetActivitiesFirstPage")) {
          return {
            vaultActivitys: {
              items: pageOne,
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
            },
            vaults: {
              items: [{ id: VAULT_A, peginTxHash: "0xpegin-a" }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          } as never;
        }
        if (src.includes("GetActivitiesNextPage")) {
          // Sanity-check the cursor we send back is the one the first page returned.
          const vars = variables as { after?: string };
          expect(vars.after).toBe("cursor-1");
          return {
            vaultActivitys: {
              items: pageTwo,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          } as never;
        }
        throw new Error(`Unexpected query: ${src}`);
      },
    );

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([]),
    );

    expect(vi.mocked(graphqlClient.request)).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.type).sort()).toEqual(["Deposit", "Withdraw"]);
  });

  it("paginates the vaults selection so pegin hashes still resolve past page one", async () => {
    const { graphqlClient } = await import("@/clients/graphql");

    const VAULT_LATE = "0x" + "9".repeat(64);
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_LATE,
      }),
    ];

    vi.mocked(graphqlClient.request).mockImplementation(
      async (query: unknown, variables?: unknown) => {
        const src = String(query);
        if (src.includes("GetActivitiesFirstPage")) {
          return {
            vaultActivitys: {
              items: rows,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
            // First vault page has only a placeholder; the activity references
            // VAULT_LATE which lives on the second vaults page.
            vaults: {
              items: [{ id: VAULT_A, peginTxHash: "0xpegin-a" }],
              pageInfo: { hasNextPage: true, endCursor: "vcursor-1" },
            },
          } as never;
        }
        if (src.includes("GetVaultsNextPage")) {
          const vars = variables as { after?: string };
          expect(vars.after).toBe("vcursor-1");
          return {
            vaults: {
              items: [{ id: VAULT_LATE, peginTxHash: "0xpegin-late" }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          } as never;
        }
        throw new Error(`Unexpected query: ${src}`);
      },
    );

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([]),
    );

    expect(result).toHaveLength(1);
    const row = asStandard(result[0]);
    expect(row.transactionHash).toBe("0xpegin-late");
    expect(row.chain).toBe("BTC");
  });
});

describe("fetchUserActivities liquidation grouping", () => {
  const VAULT_B = "0x" + "b".repeat(64);
  const TX_LIQUIDATION = "0x" + "9".repeat(64);

  function asGroup(row: ActivityRow) {
    if (row.kind !== "liquidationGroup") {
      throw new Error(`Expected liquidation group, got ${row.kind}`);
    }
    return row;
  }

  it("merges a liquidation row with its sibling repay in the same tx into one group", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
        timestamp: "1700000000",
      }),
      activity({
        type: "liquidation",
        logIndex: 0,
        transactionHash: TX_LIQUIDATION,
        vaultId: VAULT_A,
        amount: "50000000", // 0.5 sBTC at 8 decimals
        timestamp: "1700000100",
      }),
      activity({
        type: "repay",
        logIndex: 1,
        transactionHash: TX_LIQUIDATION,
        vaultId: null,
        debtReserveId: "1",
        amount: "10000000000", // 10,000 USDC at 6 decimals
        timestamp: "1700000100",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([{ id: "1", symbol: "USDC", decimals: 6 }]),
    );

    // The deposit is preserved as a standard row; the liquidation+repay collapse
    // into one LiquidationGroupRow, so 3 raw items → 2 output rows.
    expect(result).toHaveLength(2);
    const group = asGroup(result[0]);
    expect(group.summary.collateral.value).toBe("0.5");
    expect(group.summary.collateral.symbol).toBe("sBTC");
    expect(group.summary.debt?.value).toBe("10,000");
    expect(group.summary.debt?.symbol).toBe("USDC");
    expect(group.children).toHaveLength(2);
    expect(group.children[0].label).toBe("Collateral Liquidated");
    expect(group.children[1].label).toBe("Loan Repaid");
  });

  it("still emits a LiquidationGroupRow when no sibling repay exists", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
        timestamp: "1700000000",
      }),
      activity({
        type: "liquidation",
        logIndex: 0,
        transactionHash: TX_LIQUIDATION,
        vaultId: VAULT_A,
        amount: "50000000",
        timestamp: "1700000100",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    const group = asGroup(result[0]);
    expect(group.summary.debt).toBeNull();
    expect(group.children).toHaveLength(1);
    expect(group.children[0].label).toBe("Collateral Liquidated");
  });

  it("classifies as 'Fully Liquidated' when no deposited vault remains open", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
        timestamp: "1700000000",
      }),
      activity({
        type: "liquidation",
        logIndex: 0,
        transactionHash: TX_LIQUIDATION,
        vaultId: VAULT_A,
        timestamp: "1700000100",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    expect(asGroup(result[0]).type).toBe("Fully Liquidated");
  });

  it("classifies as 'Partially Liquidated' when a deposited vault is still open after the liquidation", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
        timestamp: "1700000000",
      }),
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: "0x" + "2".repeat(64),
        vaultId: VAULT_B,
        timestamp: "1700000010",
      }),
      activity({
        type: "liquidation",
        logIndex: 0,
        transactionHash: TX_LIQUIDATION,
        vaultId: VAULT_A,
        timestamp: "1700000100",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    const group = result.find((r) => r.kind === "liquidationGroup");
    if (!group) throw new Error("expected a liquidation group");
    expect(asGroup(group).type).toBe("Partially Liquidated");
  });

  it("consumes every repay in a multi-reserve liquidation tx, not just one", async () => {
    // Aave can repay multiple debt reserves in a single liquidation tx; all
    // those repays share the same transactionHash. Every one must be consumed
    // so none leak through as a standalone Repay row.
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
        timestamp: "1700000000",
      }),
      activity({
        type: "liquidation",
        logIndex: 0,
        transactionHash: TX_LIQUIDATION,
        vaultId: VAULT_A,
        amount: "50000000",
        timestamp: "1700000100",
      }),
      activity({
        type: "repay",
        logIndex: 1,
        transactionHash: TX_LIQUIDATION,
        vaultId: null,
        debtReserveId: "1",
        amount: "5000000000", // 5,000 USDC
        timestamp: "1700000100",
      }),
      activity({
        type: "repay",
        logIndex: 2,
        transactionHash: TX_LIQUIDATION,
        vaultId: null,
        debtReserveId: "2",
        amount: "3000000000", // 3,000 USDT
        timestamp: "1700000100",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps([
        { id: "1", symbol: "USDC", decimals: 6 },
        { id: "2", symbol: "USDT", decimals: 6 },
      ]),
    );

    // Deposit + LiquidationGroup, no orphan Repay rows.
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.kind === "row" && r.type === "Repay")).toBe(
      false,
    );
  });
});

describe("fetchUserActivities refunded deposits", () => {
  it("remaps a claim_expired event to a refunded Deposit row", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "claim_expired",
        logIndex: 0,
        transactionHash: "0x" + "f".repeat(64),
        vaultId: VAULT_A,
        amount: "100000000", // 1 sBTC
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    expect(result).toHaveLength(1);
    const row = asStandard(result[0]);
    expect(row.type).toBe("Deposit");
    expect(row.isRefunded).toBe(true);
    expect(row.amount).toEqual({ value: "1", symbol: "sBTC" });
    expect(row.tokenIcon).toBe("/images/btc.svg");
    // Refunded deposit links to the original BTC peg-in tx (via vault.peginTxHash)
    // for parity with normal Deposit rows.
    expect(row.chain).toBe("BTC");
  });

  it("does not double-count when a vault already has a deposit row", async () => {
    const rows: RawActivity[] = [
      activity({
        type: "deposit",
        logIndex: 0,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
        amount: "100000000",
        timestamp: "1700000000",
      }),
      activity({
        type: "claim_expired",
        logIndex: 0,
        transactionHash: "0x" + "f".repeat(64),
        vaultId: VAULT_A,
        amount: "100000000",
        timestamp: "1700000100",
      }),
    ];
    await setupGraphqlMock(rows);

    const result = await fetchUserActivities(
      USER as `0x${string}`,
      buildDeps(),
    );

    // Both rows present — Deposit and the refunded Deposit. They have distinct ids.
    expect(result).toHaveLength(2);
    const refunded = result.find(
      (r) => r.kind === "row" && r.isRefunded === true,
    );
    expect(refunded).toBeDefined();
  });
});
