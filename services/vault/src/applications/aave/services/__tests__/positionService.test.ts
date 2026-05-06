import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients", () => ({
  AaveSpoke: {
    getUserPosition: vi.fn(),
    getUserAccountData: vi.fn(),
    getUserTotalDebt: vi.fn(),
  },
}));

vi.mock("../fetchPositions", () => ({
  fetchAaveActivePositionsWithCollaterals: vi.fn(),
  fetchAavePositionByDepositor: vi.fn(),
  fetchAavePositionCollaterals: vi.fn(),
}));

import { AaveSpoke } from "../../clients";
import { fetchAaveActivePositionsWithCollaterals } from "../fetchPositions";
import {
  DebtPositionFetchError,
  getUserPositionsWithLiveData,
  IncompleteDebtDiscoveryError,
  isDebtDiscoveryError,
} from "../positionService";

const mockGetUserPosition = vi.mocked(AaveSpoke.getUserPosition);
const mockGetUserAccountData = vi.mocked(AaveSpoke.getUserAccountData);
const mockGetUserTotalDebt = vi.mocked(AaveSpoke.getUserTotalDebt);
const mockFetchActivePositions = vi.mocked(
  fetchAaveActivePositionsWithCollaterals,
);

const DEPOSITOR = "0xUser";
const SPOKE = "0x000000000000000000000000000000000000fa11" as Address;
const PROXY = "0x000000000000000000000000000000000000beef" as Address;
const VBTC_RESERVE_ID = 0n;
const RESERVE_A = 1n;
const RESERVE_B = 2n;

const indexerPosition = {
  proxyContract: PROXY,
  depositor: DEPOSITOR,
  totalCollateral: 100_000_000n,
  collaterals: [],
} as any;

function spokePosition(
  overrides: Partial<{ drawnShares: bigint; premiumShares: bigint }> = {},
) {
  return {
    drawnShares: 0n,
    premiumShares: 0n,
    premiumOffsetRay: 0n,
    suppliedShares: 0n,
    dynamicConfigKey: 0,
    ...overrides,
  };
}

function accountData(borrowCount: bigint) {
  return {
    riskPremium: 0n,
    avgCollateralFactor: 0n,
    healthFactor: 0n,
    totalCollateralValue: 0n,
    totalDebtValueRay: 0n,
    activeCollateralCount: 1n,
    borrowCount,
  };
}

describe("getUserPositionsWithLiveData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchActivePositions.mockResolvedValue([indexerPosition]);
    mockGetUserTotalDebt.mockResolvedValue(0n);
  });

  it("rejects with DebtPositionFetchError when a per-reserve RPC fails, instead of silently dropping the reserve", async () => {
    mockGetUserPosition.mockImplementation(
      async (_spoke: Address, reserveId: bigint) => {
        if (reserveId === VBTC_RESERVE_ID) return spokePosition();
        if (reserveId === RESERVE_A)
          return spokePosition({ drawnShares: 100n });
        throw new Error("rpc connection lost");
      },
    );
    mockGetUserAccountData.mockResolvedValue(accountData(2n));

    const promise = getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [RESERVE_A, RESERVE_B],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    await expect(promise).rejects.toBeInstanceOf(DebtPositionFetchError);
    await expect(promise).rejects.toMatchObject({ reserveId: RESERVE_B });
  });

  it("rejects with DebtPositionFetchError when getUserTotalDebt fails for a debt reserve", async () => {
    mockGetUserPosition.mockImplementation(
      async (_spoke: Address, reserveId: bigint) => {
        if (reserveId === VBTC_RESERVE_ID) return spokePosition();
        return spokePosition({ drawnShares: 100n });
      },
    );
    mockGetUserAccountData.mockResolvedValue(accountData(2n));
    mockGetUserTotalDebt.mockImplementation(
      async (_spoke: Address, reserveId: bigint) => {
        if (reserveId === RESERVE_B) throw new Error("rpc connection lost");
        return 500n;
      },
    );

    const promise = getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [RESERVE_A, RESERVE_B],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    await expect(promise).rejects.toBeInstanceOf(DebtPositionFetchError);
    await expect(promise).rejects.toMatchObject({ reserveId: RESERVE_B });
  });

  it("rejects with IncompleteDebtDiscoveryError when borrowCount exceeds discovered debt reserves", async () => {
    mockGetUserPosition.mockImplementation(
      async (_spoke: Address, reserveId: bigint) => {
        if (reserveId === VBTC_RESERVE_ID) return spokePosition();
        if (reserveId === RESERVE_A)
          return spokePosition({ drawnShares: 100n });
        return spokePosition();
      },
    );
    mockGetUserAccountData.mockResolvedValue(accountData(2n));

    const promise = getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [RESERVE_A, RESERVE_B],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    await expect(promise).rejects.toBeInstanceOf(IncompleteDebtDiscoveryError);
    await expect(promise).rejects.toMatchObject({
      discovered: 1,
      expected: 2n,
      queriedReserveIds: [RESERVE_A, RESERVE_B],
    });
  });

  it("resolves when discovered debt reserves match borrowCount", async () => {
    mockGetUserPosition.mockImplementation(
      async (_spoke: Address, reserveId: bigint) => {
        if (reserveId === VBTC_RESERVE_ID) return spokePosition();
        return spokePosition({ drawnShares: 100n });
      },
    );
    mockGetUserAccountData.mockResolvedValue(accountData(2n));
    mockGetUserTotalDebt.mockResolvedValue(500n);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [RESERVE_A, RESERVE_B],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debtPositions?.size).toBe(2);
    expect(result[0].debtPositions?.get(RESERVE_A)?.totalDebt).toBe(500n);
    expect(result[0].debtPositions?.get(RESERVE_B)?.totalDebt).toBe(500n);
  });

  it("skips per-reserve debt discovery when borrowCount is zero", async () => {
    mockGetUserPosition.mockResolvedValue(spokePosition());
    mockGetUserAccountData.mockResolvedValue(accountData(0n));

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [RESERVE_A, RESERVE_B],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(mockGetUserPosition).toHaveBeenCalledTimes(1);
    expect(mockGetUserPosition).toHaveBeenCalledWith(
      SPOKE,
      VBTC_RESERVE_ID,
      PROXY,
    );
    expect(result[0].debtPositions).toBeUndefined();
  });

  it("rejects with IncompleteDebtDiscoveryError when borrowCount > 0 but reserve list is empty", async () => {
    mockGetUserPosition.mockResolvedValue(spokePosition());
    mockGetUserAccountData.mockResolvedValue(accountData(1n));

    const promise = getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    await expect(promise).rejects.toBeInstanceOf(IncompleteDebtDiscoveryError);
    await expect(promise).rejects.toMatchObject({
      discovered: 0,
      expected: 1n,
      queriedReserveIds: [],
    });
  });

  it("rejects when borrowableReserveIds is undefined and borrowCount > 0", async () => {
    mockGetUserPosition.mockResolvedValue(spokePosition());
    mockGetUserAccountData.mockResolvedValue(accountData(2n));

    const promise = getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    await expect(promise).rejects.toBeInstanceOf(IncompleteDebtDiscoveryError);
  });

  it("does not block when discovered debt reserves exceed borrowCount", async () => {
    mockGetUserPosition.mockImplementation(
      async (_spoke: Address, reserveId: bigint) => {
        if (reserveId === VBTC_RESERVE_ID) return spokePosition();
        return spokePosition({ drawnShares: 1n });
      },
    );
    mockGetUserAccountData.mockResolvedValue(accountData(1n));
    mockGetUserTotalDebt.mockResolvedValue(1n);

    const result = await getUserPositionsWithLiveData(DEPOSITOR, SPOKE, {
      borrowableReserveIds: [RESERVE_A, RESERVE_B],
      vbtcReserveId: VBTC_RESERVE_ID,
    });

    expect(result[0].debtPositions?.size).toBe(2);
  });
});

describe("isDebtDiscoveryError", () => {
  it("returns true for DebtPositionFetchError", () => {
    expect(
      isDebtDiscoveryError(new DebtPositionFetchError(1n, new Error("rpc"))),
    ).toBe(true);
  });

  it("returns true for IncompleteDebtDiscoveryError", () => {
    expect(
      isDebtDiscoveryError(new IncompleteDebtDiscoveryError(0, 1n, [])),
    ).toBe(true);
  });

  it("returns false for other errors and falsy values", () => {
    expect(isDebtDiscoveryError(new Error("rpc connection lost"))).toBe(false);
    expect(isDebtDiscoveryError(null)).toBe(false);
    expect(isDebtDiscoveryError(undefined)).toBe(false);
  });
});

describe("error class names", () => {
  it("DebtPositionFetchError reports its own class name", () => {
    const err = new DebtPositionFetchError(7n, new Error("rpc lost"));
    expect(err.name).toBe("DebtPositionFetchError");
    expect(err.toString()).toMatch(/^DebtPositionFetchError:/);
  });

  it("IncompleteDebtDiscoveryError reports its own class name", () => {
    const err = new IncompleteDebtDiscoveryError(0, 1n, []);
    expect(err.name).toBe("IncompleteDebtDiscoveryError");
    expect(err.toString()).toMatch(/^IncompleteDebtDiscoveryError:/);
  });
});
