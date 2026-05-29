import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUserPosition,
  mockGetUserAccountData,
  mockGetUserPositionsBatch,
  mockGetUserTotalDebtsBatch,
  mockFetchActive,
} = vi.hoisted(() => ({
  mockGetUserPosition: vi.fn(),
  mockGetUserAccountData: vi.fn(),
  mockGetUserPositionsBatch: vi.fn(),
  mockGetUserTotalDebtsBatch: vi.fn(),
  mockFetchActive: vi.fn(),
}));

vi.mock("../../clients", () => ({
  AaveSpoke: {
    getUserPosition: mockGetUserPosition,
    getUserAccountData: mockGetUserAccountData,
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
const VBTC_RESERVE_ID = 1n;
const USDC_RESERVE_ID = 2n;
const DAI_RESERVE_ID = 3n;

const ZERO_POSITION = {
  drawnShares: 0n,
  premiumShares: 0n,
  suppliedShares: 0n,
  dynamicConfigKey: 0,
};

const DEBT_POSITION = {
  drawnShares: 1000n,
  premiumShares: 0n,
  suppliedShares: 0n,
  dynamicConfigKey: 0,
};

function setupHappyPath(borrowCount: bigint) {
  mockFetchActive.mockResolvedValue([
    {
      id: "pos-1",
      depositor: DEPOSITOR,
      proxyContract: PROXY,
      reserveId: VBTC_RESERVE_ID,
      totalCollateral: 100n,
    },
  ]);
  mockGetUserAccountData.mockResolvedValue({
    totalCollateralValue: 0n,
    totalDebtValueRay: 0n,
    healthFactor: 0n,
    borrowCount,
  });
  mockGetUserPosition.mockImplementation(
    async (_spoke: string, reserveId: bigint) => {
      // vBTC collateral position has no debt
      if (reserveId === VBTC_RESERVE_ID) return ZERO_POSITION;
      return ZERO_POSITION;
    },
  );
  // Default: no reserves carry debt. Tests that need debt override these.
  mockGetUserPositionsBatch.mockImplementation(
    async (_spoke: string, reserveIds: bigint[]) =>
      reserveIds.map(() => ZERO_POSITION),
  );
  mockGetUserTotalDebtsBatch.mockResolvedValue([]);
}

describe("getUserPositionsWithLiveData — fail-closed debt reserve discovery (audit #311)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when on-chain borrowCount > 0 but no reserve IDs were provided", async () => {
    setupHappyPath(2n);

    await expect(
      getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
        borrowableReserveIds: [],
        vbtcReserveId: VBTC_RESERVE_ID,
      }),
    ).rejects.toThrow(/no reserve IDs were provided/);
  });

  it("throws when fewer debt reserves are found than on-chain borrowCount", async () => {
    setupHappyPath(2n);
    // Only one of the two probed reserves actually has debt.
    mockGetUserPositionsBatch.mockImplementation(
      async (_spoke: string, reserveIds: bigint[]) =>
        reserveIds.map((id) =>
          id === USDC_RESERVE_ID ? DEBT_POSITION : ZERO_POSITION,
        ),
    );
    mockGetUserTotalDebtsBatch.mockResolvedValue([1000n]);

    await expect(
      getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
        borrowableReserveIds: [USDC_RESERVE_ID, DAI_RESERVE_ID],
        vbtcReserveId: VBTC_RESERVE_ID,
      }),
    ).rejects.toThrow(/found 1.*incomplete/i);
  });

  it("does not throw when borrowCount is 0 even with an empty reserve list", async () => {
    setupHappyPath(0n);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debtPositions).toBeUndefined();
  });

  it("returns debtPositions when count matches borrowCount", async () => {
    setupHappyPath(1n);
    mockGetUserPositionsBatch.mockImplementation(
      async (_spoke: string, reserveIds: bigint[]) =>
        reserveIds.map((id) =>
          id === USDC_RESERVE_ID ? DEBT_POSITION : ZERO_POSITION,
        ),
    );
    mockGetUserTotalDebtsBatch.mockResolvedValue([1000n]);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [USDC_RESERVE_ID],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result[0].debtPositions?.size).toBe(1);
  });

  it("issues one multicall for position probe and one for total-debt readout", async () => {
    setupHappyPath(1n);
    mockGetUserPositionsBatch.mockImplementation(
      async (_spoke: string, reserveIds: bigint[]) =>
        reserveIds.map((id) =>
          id === USDC_RESERVE_ID ? DEBT_POSITION : ZERO_POSITION,
        ),
    );
    mockGetUserTotalDebtsBatch.mockResolvedValue([1000n]);

    await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [USDC_RESERVE_ID, DAI_RESERVE_ID],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(mockGetUserPositionsBatch).toHaveBeenCalledTimes(1);
    expect(mockGetUserTotalDebtsBatch).toHaveBeenCalledTimes(1);
    // Total-debt readout queries only the reserves that actually carry debt.
    expect(mockGetUserTotalDebtsBatch).toHaveBeenCalledWith(
      SPOKE,
      [USDC_RESERVE_ID],
      PROXY,
    );
  });

  it("treats per-reserve probe failures (null in the batch) as 'no debt'", async () => {
    setupHappyPath(0n);
    // Use mockImplementation (not mockResolvedValueOnce) so the queue is
    // empty for downstream tests — vi.clearAllMocks does not drain queued
    // onces.
    mockGetUserPositionsBatch.mockImplementation(async () => [null, null]);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [USDC_RESERVE_ID, DAI_RESERVE_ID],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debtPositions).toBeUndefined();
    expect(mockGetUserTotalDebtsBatch).not.toHaveBeenCalled();
  });

  it("propagates total-debt multicall failures for discovered debt reserves", async () => {
    setupHappyPath(1n);
    mockGetUserPositionsBatch.mockImplementation(
      async (_spoke: string, reserveIds: bigint[]) =>
        reserveIds.map((id) =>
          id === USDC_RESERVE_ID ? DEBT_POSITION : ZERO_POSITION,
        ),
    );
    // Hard-fail semantics: a debt-readout failure must surface, not get
    // silently treated as 0n debt. The once-reject is consumed by the awaited
    // call below, so it cannot leak into the next test even though
    // vi.clearAllMocks doesn't drain queued onces.
    mockGetUserTotalDebtsBatch.mockRejectedValueOnce(
      new Error("InvalidReserve"),
    );

    await expect(
      getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
        borrowableReserveIds: [USDC_RESERVE_ID],
        vbtcReserveId: VBTC_RESERVE_ID,
      }),
    ).rejects.toThrow("InvalidReserve");
  });

  it("aligns debt-position results to reserveIds by index (not order in the multicall response)", async () => {
    setupHappyPath(2n);
    // Both reserves carry debt with distinct drawnShares; assert each maps
    // to its own reserveId by index, not by content matching.
    const USDC_DEBT_POSITION = { ...DEBT_POSITION, drawnShares: 1000n };
    const DAI_DEBT_POSITION = { ...DEBT_POSITION, drawnShares: 2000n };
    mockGetUserPositionsBatch.mockImplementation(
      async (_spoke: string, reserveIds: bigint[]) =>
        reserveIds.map((id) => {
          if (id === USDC_RESERVE_ID) return USDC_DEBT_POSITION;
          if (id === DAI_RESERVE_ID) return DAI_DEBT_POSITION;
          return ZERO_POSITION;
        }),
    );
    mockGetUserTotalDebtsBatch.mockResolvedValue([100n, 200n]);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [USDC_RESERVE_ID, DAI_RESERVE_ID],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result[0].debtPositions?.get(USDC_RESERVE_ID)?.drawnShares).toBe(
      1000n,
    );
    expect(result[0].debtPositions?.get(USDC_RESERVE_ID)?.totalDebt).toBe(100n);
    expect(result[0].debtPositions?.get(DAI_RESERVE_ID)?.drawnShares).toBe(
      2000n,
    );
    expect(result[0].debtPositions?.get(DAI_RESERVE_ID)?.totalDebt).toBe(200n);
  });
});
