import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "@/applications/aave/constants";

import { useDashboardState } from "../useDashboardState";

const stableFindProvider = vi.fn(() => undefined);

const VAULT_A = ("0x" + "a".repeat(64)) as `0x${string}`;
const VAULT_B = ("0x" + "b".repeat(64)) as `0x${string}`;
const VAULT_C = ("0x" + "c".repeat(64)) as `0x${string}`;

type ActivatingEntry = {
  vaultId: `0x${string}`;
  depositorEthAddress?: string;
  amountBtc: number;
  providerAddress?: string;
};

// Mutable state read by the hoisted mocks below.
let mockCollaterals: unknown[] | null = null;
let mockCollateralBtc = 0;
let mockCollateralValueUsd = 0;
let mockDebtValueUsd = 0;
let mockSplitParams: { THF: number; CF: number; LB: number } | null = null;
let mockReorderedOrder: readonly `0x${string}`[] | null = null;
let mockActivatingVaults = new Map<string, ActivatingEntry>();
const mockClearReorderedOrder = vi.fn();
const mockClearActivatingVault = vi.fn();

vi.mock("@/applications/aave/context", () => ({
  useReorderOverride: () => ({
    reorderedOrder: mockReorderedOrder,
    applyReorderedOrder: vi.fn(),
    clearReorderedOrder: mockClearReorderedOrder,
  }),
  useActivatingVaults: () => ({
    activatingVaults: mockActivatingVaults,
    addActivatingVault: vi.fn(),
    clearActivatingVault: mockClearActivatingVault,
  }),
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveUserPosition: () => ({
    position: mockCollaterals ? { collaterals: mockCollaterals } : null,
    collateralBtc: mockCollateralBtc,
    collateralValueUsd: mockCollateralValueUsd,
    debtValueUsd: mockDebtValueUsd,
    healthFactor: null,
    healthFactorStatus: null,
    isLoading: false,
  }),
  useAaveBorrowedAssets: () => ({
    borrowedAssets: [],
    hasLoans: false,
  }),
  useVaultSplitParams: () => ({
    params: mockSplitParams,
    isLoading: false,
    error: null,
    refetch: async () => mockSplitParams,
  }),
}));

vi.mock("@/hooks/deposit/useVaultProviders", () => ({
  useVaultProviders: () => ({
    vaultProviders: [],
    vaultKeepers: [],
    loading: false,
    error: null,
    refetch: async () => {},
    findProvider: stableFindProvider,
  }),
}));

/** Minimal active collateral with a given vaultId and indexer liquidationIndex. */
function collateral(vaultId: `0x${string}`, liquidationIndex: number) {
  return {
    depositorAddress: "0xdep",
    vaultId,
    amount: 100n,
    addedAt: 0n,
    removedAt: null,
    liquidationIndex,
    vault: undefined,
  };
}

function vaultIds(entries: { vaultId: string }[]): string[] {
  return entries.map((e) => e.vaultId);
}

describe("useDashboardState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollaterals = null;
    mockCollateralBtc = 0;
    mockCollateralValueUsd = 0;
    mockDebtValueUsd = 0;
    mockSplitParams = null;
    mockReorderedOrder = null;
    mockActivatingVaults = new Map();
  });

  it("returns a stable collateralVaults reference across re-renders when position?.collaterals is undefined", () => {
    const { result, rerender } = renderHook(() => useDashboardState("0xabc"));
    const first = result.current.collateralVaults;
    rerender();
    expect(result.current.collateralVaults).toBe(first);
  });

  it("sorts by liquidationIndex when there is no reorder override", () => {
    // Provide collaterals out of order; expect liquidationIndex ordering.
    mockCollaterals = [
      collateral(VAULT_B, 1),
      collateral(VAULT_A, 0),
      collateral(VAULT_C, 2),
    ];

    const { result } = renderHook(() => useDashboardState("0xabc"));

    expect(vaultIds(result.current.collateralVaults)).toEqual([
      VAULT_A,
      VAULT_B,
      VAULT_C,
    ]);
    expect(mockClearReorderedOrder).not.toHaveBeenCalled();
  });

  it("sorts by the submitted override when it is a valid permutation", () => {
    // Indexer order is A,B,C but the submitted override says C,A,B.
    mockCollaterals = [
      collateral(VAULT_A, 0),
      collateral(VAULT_B, 1),
      collateral(VAULT_C, 2),
    ];
    mockReorderedOrder = [VAULT_C, VAULT_A, VAULT_B];

    const { result } = renderHook(() => useDashboardState("0xabc"));

    const vaults = result.current.collateralVaults;
    expect(vaultIds(vaults)).toEqual([VAULT_C, VAULT_A, VAULT_B]);
    // The hook applies the override rewrite, so the first row's ordinal index
    // matches its displayed position (exhaustive cases live in
    // collateralOrder.test.ts).
    expect(vaults[0]).toMatchObject({ vaultId: VAULT_C, liquidationIndex: 0 });
  });

  it("clears the override once the indexer order matches it", () => {
    mockCollaterals = [
      collateral(VAULT_A, 0),
      collateral(VAULT_B, 1),
      collateral(VAULT_C, 2),
    ];
    // Indexer already reflects the override order.
    mockReorderedOrder = [VAULT_A, VAULT_B, VAULT_C];

    renderHook(() => useDashboardState("0xabc"));

    expect(mockClearReorderedOrder).toHaveBeenCalled();
  });

  it("falls back to liquidationIndex and clears when the override no longer matches the vault set", () => {
    // Override references a vault that is no longer collateral (e.g. withdrawn).
    mockCollaterals = [collateral(VAULT_A, 0), collateral(VAULT_B, 1)];
    mockReorderedOrder = [VAULT_B, VAULT_A, VAULT_C];

    const { result } = renderHook(() => useDashboardState("0xabc"));

    expect(vaultIds(result.current.collateralVaults)).toEqual([
      VAULT_A,
      VAULT_B,
    ]);
    expect(mockClearReorderedOrder).toHaveBeenCalled();
  });

  it("appends an optimistic activating row when the vault is not yet indexed", () => {
    mockCollaterals = null; // empty position (first deposit)
    mockActivatingVaults = new Map([
      [
        VAULT_A.toLowerCase(),
        { vaultId: VAULT_A, depositorEthAddress: "0xabc", amountBtc: 1 },
      ],
    ]);

    const { result } = renderHook(() => useDashboardState("0xabc"));

    expect(result.current.collateralVaults).toHaveLength(1);
    expect(result.current.collateralVaults[0]).toMatchObject({
      vaultId: VAULT_A,
      amountBtc: 1,
      isActivating: true,
      inUse: false,
    });
    // Display total + display gate reflect the optimistic vault, while the
    // financial collateralBtc and the action-gating hasCollateral stay
    // indexer-pure (so Borrow can't be unlocked before collateral exists).
    expect(result.current.displayCollateralBtc).toBe(1);
    expect(result.current.collateralBtc).toBe(0);
    expect(result.current.hasDisplayCollateral).toBe(true);
    expect(result.current.hasCollateral).toBe(false);
    expect(mockClearActivatingVault).not.toHaveBeenCalled();
  });

  it("drops the activating override and does not duplicate once the indexer reflects the vault", () => {
    mockCollateralBtc = 1;
    mockCollaterals = [collateral(VAULT_A, 0)];
    mockActivatingVaults = new Map([
      [
        VAULT_A.toLowerCase(),
        { vaultId: VAULT_A, depositorEthAddress: "0xabc", amountBtc: 1 },
      ],
    ]);

    const { result } = renderHook(() => useDashboardState("0xabc"));

    // Only the indexer row remains — no duplicate optimistic row.
    expect(vaultIds(result.current.collateralVaults)).toEqual([VAULT_A]);
    expect(result.current.collateralVaults[0].isActivating).toBeUndefined();
    // Reconciliation clears the now-indexed activating entry.
    expect(mockClearActivatingVault).toHaveBeenCalledWith(VAULT_A);
    // Display total is not double-counted.
    expect(result.current.displayCollateralBtc).toBe(1);
  });

  it("does not surface an activating vault belonging to a different connected address", () => {
    mockCollaterals = null;
    // Entry was recorded while a different wallet was connected.
    mockActivatingVaults = new Map([
      [
        VAULT_A.toLowerCase(),
        { vaultId: VAULT_A, depositorEthAddress: "0xother", amountBtc: 1 },
      ],
    ]);

    const { result } = renderHook(() => useDashboardState("0xabc"));

    expect(result.current.collateralVaults).toHaveLength(0);
    expect(result.current.displayCollateralBtc).toBe(0);
    expect(result.current.hasDisplayCollateral).toBe(false);
  });

  it("derives borrow capacity from collateral, debt, and split params", () => {
    mockCollateralBtc = 1;
    mockCollateralValueUsd = 10000;
    mockDebtValueUsd = 2000;
    mockSplitParams = { THF: 1.1, CF: 0.8, LB: 1.05 };

    const { result } = renderHook(() => useDashboardState("0xabc"));

    const expectedMaxTotalDebtUsd =
      (10000 * Math.round(0.8 * BPS_SCALE)) /
      BPS_SCALE /
      MIN_HEALTH_FACTOR_FOR_BORROW;
    expect(result.current.maxTotalDebtUsd).toBe(expectedMaxTotalDebtUsd);
    expect(result.current.availableToBorrowUsd).toBe(
      expectedMaxTotalDebtUsd - 2000,
    );
  });

  it("reports zero borrow capacity while split params are unavailable", () => {
    mockCollateralBtc = 1;
    mockCollateralValueUsd = 10000;
    mockDebtValueUsd = 0;
    mockSplitParams = null;

    const { result } = renderHook(() => useDashboardState("0xabc"));

    expect(result.current.maxTotalDebtUsd).toBe(0);
    expect(result.current.availableToBorrowUsd).toBe(0);
  });
});
