import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchUserActivities } from "../fetchActivities";

vi.mock("@/clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/applications", () => ({
  getApplication: vi.fn(),
  getApplicationMetadataByController: vi.fn(),
}));

vi.mock("@/applications/aave/config", () => ({
  AAVE_APP_ID: "aave",
}));

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({
    coinSymbol: "sBTC",
    icon: "/images/btc.svg",
  }),
}));

const USER = "0x1111111111111111111111111111111111111111";
const VAULT_A = "0x" + "a".repeat(64);
const VAULT_B = "0x" + "b".repeat(64);
const TX_DEPOSIT = "0x" + "1".repeat(64);
const TX_REDEEM = "0x" + "2".repeat(64);
const TX_LIQ = "0x" + "3".repeat(64);
const TX_BORROW = "0x" + "4".repeat(64);

const AAVE_META = {
  id: "aave",
  name: "Aave V4",
  logoUrl: "/images/aave.svg",
};

type ActivityRow = {
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

type ActivityOverrides = Partial<Omit<ActivityRow, "id">> & {
  logIndex?: number;
};

function activity(overrides: ActivityOverrides): ActivityRow {
  const { logIndex = 0, ...rest } = overrides;
  const base: ActivityRow = {
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
  base.id = `${base.transactionHash}-${logIndex}-${base.type}-${base.vaultId ?? "nil"}`;
  return base;
}

async function setupMocks(
  activities: ActivityRow[],
  reserves: Array<{
    id: string;
    decimals: number;
    underlyingToken: { symbol: string; decimals: number } | null;
  }> = [],
) {
  const { graphqlClient } = await import("@/clients/graphql");
  const { getApplication, getApplicationMetadataByController } = await import(
    "@/applications"
  );

  vi.mocked(getApplication).mockReturnValue({
    metadata: AAVE_META,
  } as never);
  vi.mocked(getApplicationMetadataByController).mockReturnValue(
    AAVE_META as never,
  );

  vi.mocked(graphqlClient.request).mockImplementation(
    async (query: unknown) => {
      const src = String(query);
      if (src.includes("GetUserActivities")) {
        return { vaultActivitys: { items: activities } } as never;
      }
      if (src.includes("GetVaultsByIds")) {
        const ids = Array.from(
          new Set(
            activities
              .map((a) => a.vaultId)
              .filter((v): v is string => v != null),
          ),
        );
        return {
          vaults: {
            items: ids.map((id) => ({
              id,
              applicationEntryPoint: "0xcontroller",
            })),
          },
        } as never;
      }
      if (src.includes("GetReservesByIds")) {
        return { aaveReserves: { items: reserves } } as never;
      }
      throw new Error(`Unexpected query: ${src}`);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchUserActivities type mapping", () => {
  it("maps all 8 indexer types to display labels", async () => {
    const rows: ActivityRow[] = [
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
        type: "add_collateral",
        logIndex: 0,
        transactionHash: "0x" + "c".repeat(64),
        vaultId: VAULT_A,
      }),
      activity({
        type: "remove_collateral",
        logIndex: 0,
        transactionHash: "0x" + "d".repeat(64),
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
        amount: "1000000", // 1 USDC at 6 decimals
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
    await setupMocks(rows, [
      {
        id: "1",
        decimals: 6,
        underlyingToken: { symbol: "USDC", decimals: 6 },
      },
    ]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    const types = result.map((r) => r.type);

    expect(types).toEqual(
      expect.arrayContaining([
        "Deposit",
        "Withdraw",
        "Add Collateral",
        "Remove Collateral",
        "Liquidation",
        "Borrow",
        "Repay",
        "Redeem",
      ]),
    );
    expect(result).toHaveLength(8);
  });
});

describe("fetchUserActivities dedup", () => {
  it("collapses deposit + add_collateral in same tx into one Deposit row", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "deposit",
        logIndex: 5,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
      }),
      activity({
        type: "add_collateral",
        logIndex: 7,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
      }),
    ];
    await setupMocks(rows);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("Deposit");
  });

  it("collapses remove_collateral + redeem in same tx into one Redeem row", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "remove_collateral",
        logIndex: 5,
        transactionHash: TX_REDEEM,
        vaultId: VAULT_A,
      }),
      activity({
        type: "redeem",
        logIndex: 8,
        transactionHash: TX_REDEEM,
        vaultId: VAULT_A,
      }),
    ];
    await setupMocks(rows);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("Redeem");
  });

  it("collapses liquidation + redeem in same tx into one Liquidation row", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "liquidation",
        logIndex: 5,
        transactionHash: TX_LIQ,
        vaultId: VAULT_A,
      }),
      activity({
        type: "redeem",
        logIndex: 8,
        transactionHash: TX_LIQ,
        vaultId: VAULT_A,
      }),
    ];
    await setupMocks(rows);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("Liquidation");
  });

  it("does not collapse multi-reserve borrows in the same tx", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "borrow",
        logIndex: 3,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
      activity({
        type: "borrow",
        logIndex: 5,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "2",
        amount: "2000000",
      }),
    ];
    await setupMocks(rows, [
      {
        id: "1",
        decimals: 6,
        underlyingToken: { symbol: "USDC", decimals: 6 },
      },
      {
        id: "2",
        decimals: 6,
        underlyingToken: { symbol: "USDT", decimals: 6 },
      },
    ]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === "Borrow")).toBe(true);
  });

  it("does not collapse rows with different vaultIds even if in same tx", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "deposit",
        logIndex: 5,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_A,
      }),
      activity({
        type: "add_collateral",
        logIndex: 6,
        transactionHash: TX_DEPOSIT,
        vaultId: VAULT_B,
      }),
    ];
    await setupMocks(rows);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(2);
  });
});

describe("fetchUserActivities null-safe fetching", () => {
  it("does not query vaults when all activities are position-scoped", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1000000",
      }),
    ];
    await setupMocks(rows, [
      {
        id: "1",
        decimals: 6,
        underlyingToken: { symbol: "USDC", decimals: 6 },
      },
    ]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    const { graphqlClient } = await import("@/clients/graphql");
    const calls = vi.mocked(graphqlClient.request).mock.calls;

    expect(calls.some(([q]) => String(q).includes("GetVaultsByIds"))).toBe(
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0].amount.symbol).toBe("USDC");
  });
});

describe("fetchUserActivities borrow/repay formatting", () => {
  it("formats borrow amount with reserve decimals, not BTC decimals", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1500000000", // 1500.000000 USDC at 6 decimals
      }),
    ];
    await setupMocks(rows, [
      {
        id: "1",
        decimals: 6,
        underlyingToken: { symbol: "USDC", decimals: 6 },
      },
    ]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(1);
    expect(result[0].amount.symbol).toBe("USDC");
    expect(result[0].amount.value).toBe("1,500");
  });

  it("degrades gracefully when a borrow row has no debtReserveId", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: null,
        amount: "1000000",
      }),
    ];
    await setupMocks(rows);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("Borrow");
    expect(result[0].amount.symbol).toBe("—");
    // When decimals aren't known, surface the raw amount string rather than
    // blanking the whole Activity tab.
    expect(result[0].amount.value).toBe("1000000");
  });

  it("falls back to reserve.decimals when underlyingToken is null", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "borrow",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "1500000000",
      }),
    ];
    await setupMocks(rows, [{ id: "1", decimals: 6, underlyingToken: null }]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result).toHaveLength(1);
    expect(result[0].amount.symbol).toBe("—");
    expect(result[0].amount.value).toBe("1,500");
  });

  it("formats high-decimals tokens without JS number precision loss", async () => {
    const rows: ActivityRow[] = [
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
    await setupMocks(rows, [
      {
        id: "1",
        decimals: 18,
        underlyingToken: { symbol: "DAI", decimals: 18 },
      },
    ]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result[0].amount.symbol).toBe("DAI");
    // Integer part must be exact (parseFloat would have lost precision here).
    // Fractional part is capped at MAX_DISPLAY_FRACTION_DIGITS = 8.
    expect(result[0].amount.value).toBe("12,345,678.12345678");
  });

  it("uses Aave app metadata for Borrow/Repay rows", async () => {
    const rows: ActivityRow[] = [
      activity({
        type: "repay",
        logIndex: 0,
        transactionHash: TX_BORROW,
        vaultId: null,
        debtReserveId: "1",
        amount: "500000",
      }),
    ];
    await setupMocks(rows, [
      {
        id: "1",
        decimals: 6,
        underlyingToken: { symbol: "USDC", decimals: 6 },
      },
    ]);

    const result = await fetchUserActivities(USER as `0x${string}`);
    expect(result[0].application.id).toBe("aave");
    expect(result[0].application.name).toBe("Aave V4");
  });
});
