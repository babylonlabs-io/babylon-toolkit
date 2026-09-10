import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetPosition,
  mockGetUserPositionWithAccountData,
  mockGetUserPositionsBatch,
  mockGetUserTotalDebtsBatch,
  mockFetchActive,
} = vi.hoisted(() => ({
  mockGetPosition: vi.fn(),
  mockGetUserPositionWithAccountData: vi.fn(),
  mockGetUserPositionsBatch: vi.fn(),
  mockGetUserTotalDebtsBatch: vi.fn(),
  mockFetchActive: vi.fn(),
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
  ethClient: { getPublicClient: () => ({ __mockPublicClient: true }) },
}));
vi.mock("../../config", () => ({ getAaveAdapterAddress: () => ADAPTER }));
vi.mock("../../clients", () => ({
  AaveSpoke: {
    getUserPositionWithAccountData: mockGetUserPositionWithAccountData,
    getUserPositionsBatch: mockGetUserPositionsBatch,
    getUserTotalDebtsBatch: mockGetUserTotalDebtsBatch,
  },
}));
vi.mock("../fetchPositions", () => ({
  fetchAaveActivePositionsWithCollaterals: mockFetchActive,
}));

import { getUserPositionsWithLiveData } from "../positionService";

const DEPOSITOR = ("0x" + "1".repeat(40)) as `0x${string}`;
const SPOKE = ("0x" + "2".repeat(40)) as `0x${string}`;
const PROXY = ("0x" + "3".repeat(40)) as `0x${string}`;
const ADAPTER = ("0x" + "a".repeat(40)) as `0x${string}`;
const VBTC_RESERVE_ID = 1n;
const USDC_RESERVE_ID = 2n;
const DAI_RESERVE_ID = 3n;
const INDEXED_POSITION = {
  id: "pos-1",
  depositorAddress: DEPOSITOR,
  proxyContract: PROXY,
  reserveId: VBTC_RESERVE_ID,
  totalCollateral: 100n,
  collaterals: [],
};
const ZERO_POSITION = {
  drawnShares: 0n,
  premiumShares: 0n,
  suppliedShares: 0n,
  dynamicConfigKey: 0,
};
const DEBT_POSITION = { ...ZERO_POSITION, drawnShares: 1000n };

function setupHappyPath(borrowCount: bigint) {
  mockGetPosition.mockResolvedValue({
    proxyContract: PROXY,
    vaultIds: [],
    totalCollateralBTC: INDEXED_POSITION.totalCollateral,
  });
  mockFetchActive.mockResolvedValue([INDEXED_POSITION]);
  mockGetUserPositionWithAccountData.mockResolvedValue({
    position: ZERO_POSITION,
    accountData: {
      totalCollateralValue: 0n,
      totalDebtValueRay: borrowCount > 0n ? 1000n : 0n,
      healthFactor: 0n,
      borrowCount,
    },
  });
  mockGetUserPositionsBatch.mockImplementation(
    async (_spoke: string, reserveIds: bigint[]) =>
      reserveIds.map((id) =>
        borrowCount > 0n && id === USDC_RESERVE_ID
          ? DEBT_POSITION
          : ZERO_POSITION,
      ),
  );
  mockGetUserTotalDebtsBatch.mockResolvedValue([1000n]);
}

function load(borrowableReserveIds = [USDC_RESERVE_ID, DAI_RESERVE_ID]) {
  return getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
    borrowableReserveIds,
    vbtcReserveId: VBTC_RESERVE_ID,
  });
}

describe("getUserPositionsWithLiveData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath(0n);
  });

  it("throws when on-chain borrowCount > 0 but no reserve IDs were provided", async () => {
    setupHappyPath(2n);
    await expect(load([])).rejects.toThrow(/no reserve IDs were provided/);
  });

  it("throws when fewer debt reserves are found than on-chain borrowCount", async () => {
    setupHappyPath(2n);
    await expect(load()).rejects.toThrow(/found 1.*incomplete/i);
  });

  it("does not throw when borrowCount is 0 even with an empty reserve list", async () => {
    const result = await load([]);
    expect(result).toHaveLength(1);
    expect(result[0].debtPositions).toBeUndefined();
  });

  it("returns complete debt data with one call per read batch", async () => {
    setupHappyPath(1n);
    const result = await load();
    expect(result[0].debtPositions?.size).toBe(1);
    expect(mockGetUserPositionWithAccountData).toHaveBeenCalledTimes(1);
    expect(mockGetUserPositionWithAccountData).toHaveBeenCalledWith(
      SPOKE,
      VBTC_RESERVE_ID,
      PROXY,
    );
    expect(mockGetUserPositionsBatch).toHaveBeenCalledTimes(1);
    expect(mockGetUserTotalDebtsBatch).toHaveBeenCalledTimes(1);
    expect(mockGetUserTotalDebtsBatch).toHaveBeenCalledWith(
      SPOKE,
      [USDC_RESERVE_ID],
      PROXY,
    );
  });

  it("does not read debt reserves when the on-chain borrowCount is zero", async () => {
    const result = await load();
    expect(result).toHaveLength(1);
    expect(result[0].debtPositions).toBeUndefined();
    expect(mockGetUserPositionsBatch).not.toHaveBeenCalled();
    expect(mockGetUserTotalDebtsBatch).not.toHaveBeenCalled();
  });

  it("propagates total-debt multicall failures for discovered debt reserves", async () => {
    setupHappyPath(1n);
    mockGetUserTotalDebtsBatch.mockRejectedValueOnce(
      new Error("InvalidReserve"),
    );
    await expect(load([USDC_RESERVE_ID])).rejects.toThrow("InvalidReserve");
  });

  it("aligns debt-position results to reserveIds by index", async () => {
    setupHappyPath(2n);
    mockGetUserPositionsBatch.mockResolvedValue([
      DEBT_POSITION,
      { ...DEBT_POSITION, drawnShares: 2000n },
    ]);
    mockGetUserTotalDebtsBatch.mockResolvedValue([100n, 200n]);
    const [result] = await load();
    expect(result.debtPositions?.get(USDC_RESERVE_ID)).toMatchObject({
      drawnShares: 1000n,
      totalDebt: 100n,
    });
    expect(result.debtPositions?.get(DAI_RESERVE_ID)).toMatchObject({
      drawnShares: 2000n,
      totalDebt: 200n,
    });
  });

  it("keeps live debt when the indexer returns no position", async () => {
    setupHappyPath(1n);
    mockFetchActive.mockResolvedValue([]);
    const [result] = await load();
    expect(mockGetPosition).toHaveBeenCalledWith(
      { __mockPublicClient: true },
      ADAPTER,
      DEPOSITOR,
    );
    expect(result).toMatchObject({
      proxyContract: PROXY,
      totalCollateral: INDEXED_POSITION.totalCollateral,
      collaterals: [],
      accountData: { totalDebtValueRay: 1000n, borrowCount: 1n },
    });
    expect(result.indexerError?.message).toContain("do not match");
    expect(result.debtPositions?.get(USDC_RESERVE_ID)?.totalDebt).toBe(1000n);
    expect(mockGetUserPositionsBatch).toHaveBeenCalledWith(
      SPOKE,
      [USDC_RESERVE_ID, DAI_RESERVE_ID],
      PROXY,
    );
  });

  it("keeps live debt and reports a failed indexer read", async () => {
    setupHappyPath(1n);
    const error = new Error("Indexer unavailable");
    mockFetchActive.mockRejectedValueOnce(error);
    const [result] = await load();
    expect(result.indexerError?.cause).toBe(error);
    expect(result.collaterals).toEqual([]);
    expect(result.debtPositions?.get(USDC_RESERVE_ID)?.totalDebt).toBe(1000n);
  });

  it("rejects an incomplete debt result when a reserve probe returns null", async () => {
    setupHappyPath(2n);
    mockGetUserPositionsBatch.mockResolvedValue([DEBT_POSITION, null]);
    await expect(load()).rejects.toThrow(/found 1.*incomplete/i);
    expect(mockGetUserTotalDebtsBatch).toHaveBeenCalledWith(
      SPOKE,
      [USDC_RESERVE_ID],
      PROXY,
    );
  });

  it("returns no position only when the chain confirms none exists", async () => {
    mockGetPosition.mockResolvedValue(null);
    mockFetchActive.mockResolvedValue([]);
    await expect(load()).resolves.toEqual([]);
    expect(mockGetUserPositionWithAccountData).not.toHaveBeenCalled();
  });

  it("propagates an adapter RPC failure instead of returning no debt", async () => {
    mockFetchActive.mockResolvedValue([]);
    mockGetPosition.mockRejectedValueOnce(new Error("Adapter RPC down"));
    await expect(load()).rejects.toThrow("Adapter RPC down");
  });

  it("propagates a Spoke RPC failure instead of returning no debt", async () => {
    mockFetchActive.mockResolvedValue([]);
    mockGetUserPositionWithAccountData.mockRejectedValueOnce(
      new Error("Spoke RPC down"),
    );
    await expect(load()).rejects.toThrow("Spoke RPC down");
  });

  it("uses the chain proxy and collateral when indexer values differ", async () => {
    mockFetchActive.mockResolvedValue([
      { ...INDEXED_POSITION, proxyContract: SPOKE, totalCollateral: 0n },
    ]);
    const [result] = await load();
    expect(result.proxyContract).toBe(PROXY);
    expect(result.totalCollateral).toBe(INDEXED_POSITION.totalCollateral);
    expect(mockGetUserPositionWithAccountData).toHaveBeenCalledWith(
      SPOKE,
      VBTC_RESERVE_ID,
      PROXY,
    );
  });

  it("accepts matching collateral details regardless of address case", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: PROXY,
      vaultIds: [ADAPTER],
      totalCollateralBTC: 100n,
    });
    const collaterals = [
      { vaultId: ADAPTER.toUpperCase(), amount: 100n, removedAt: null },
    ];
    mockFetchActive.mockResolvedValue([{ ...INDEXED_POSITION, collaterals }]);
    const [result] = await load();
    expect(result.indexerError).toBeUndefined();
    expect(result.collaterals).toEqual(collaterals);
  });

  it("excludes removed collateral history from the active chain comparison", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: PROXY,
      vaultIds: [ADAPTER],
      totalCollateralBTC: 100n,
    });
    const collaterals = [
      { vaultId: ADAPTER, amount: 100n, removedAt: null },
      { vaultId: PROXY, amount: 50n, removedAt: 1n },
    ];
    mockFetchActive.mockResolvedValue([{ ...INDEXED_POSITION, collaterals }]);
    const [result] = await load();
    expect(result.indexerError).toBeUndefined();
    expect(result.totalCollateral).toBe(100n);
    expect(result.collaterals).toEqual(collaterals);
  });

  it("reports a different indexed vault even when row count and total match", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: PROXY,
      vaultIds: [ADAPTER],
      totalCollateralBTC: 100n,
    });
    mockFetchActive.mockResolvedValue([
      {
        ...INDEXED_POSITION,
        collaterals: [{ vaultId: PROXY, amount: 100n, removedAt: null }],
      },
    ]);
    const [result] = await load();
    expect(result.indexerError?.message).toContain("do not match");
    expect(result.vaultIds).toEqual([ADAPTER]);
  });

  it("reports stale collateral amounts even when every vault ID matches", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: PROXY,
      vaultIds: [ADAPTER],
      totalCollateralBTC: 100n,
    });
    mockFetchActive.mockResolvedValue([
      {
        ...INDEXED_POSITION,
        collaterals: [{ vaultId: ADAPTER, amount: 90n, removedAt: null }],
      },
    ]);
    const [result] = await load();
    expect(result.indexerError?.message).toContain("do not match");
    expect(result.totalCollateral).toBe(100n);
  });
});
