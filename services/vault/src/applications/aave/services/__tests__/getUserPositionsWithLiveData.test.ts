import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUserPosition,
  mockGetUserAccountData,
  mockGetUserTotalDebt,
  mockFetchActive,
} = vi.hoisted(() => ({
  mockGetUserPosition: vi.fn(),
  mockGetUserAccountData: vi.fn(),
  mockGetUserTotalDebt: vi.fn(),
  mockFetchActive: vi.fn(),
}));

vi.mock("../../clients", () => ({
  AaveSpoke: {
    getUserPosition: mockGetUserPosition,
    getUserAccountData: mockGetUserAccountData,
    getUserTotalDebt: mockGetUserTotalDebt,
  },
}));

vi.mock("../fetchPositions", () => ({
  fetchAaveActivePositionsWithCollaterals: mockFetchActive,
  fetchAavePositionByDepositor: vi.fn(),
  fetchAavePositionCollaterals: vi.fn(),
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
  mockGetUserTotalDebt.mockResolvedValue(0n);
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
    mockGetUserPosition.mockImplementation(
      async (_spoke: string, reserveId: bigint) => {
        if (reserveId === USDC_RESERVE_ID) return DEBT_POSITION;
        return ZERO_POSITION;
      },
    );
    mockGetUserTotalDebt.mockResolvedValue(1000n);

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
    mockGetUserPosition.mockImplementation(
      async (_spoke: string, reserveId: bigint) => {
        if (reserveId === USDC_RESERVE_ID) return DEBT_POSITION;
        return ZERO_POSITION;
      },
    );
    mockGetUserTotalDebt.mockResolvedValue(1000n);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [USDC_RESERVE_ID],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result[0].debtPositions?.size).toBe(1);
  });
});
