import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardState } from "../useDashboardState";

const stableFindProvider = vi.fn(() => undefined);

const VAULT_A = ("0x" + "a".repeat(64)) as `0x${string}`;
const VAULT_B = ("0x" + "b".repeat(64)) as `0x${string}`;
const VAULT_C = ("0x" + "c".repeat(64)) as `0x${string}`;

// Mutable state read by the hoisted mocks below.
let mockCollaterals: unknown[] | null = null;
let mockReorderedOrder: readonly `0x${string}`[] | null = null;
const mockClearReorderedOrder = vi.fn();

vi.mock("@/applications/aave/context", () => ({
  useReorderOverride: () => ({
    reorderedOrder: mockReorderedOrder,
    applyReorderedOrder: vi.fn(),
    clearReorderedOrder: mockClearReorderedOrder,
  }),
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveUserPosition: () => ({
    position: mockCollaterals ? { collaterals: mockCollaterals } : null,
    collateralBtc: 0,
    collateralValueUsd: 0,
    debtValueUsd: 0,
    healthFactor: null,
    healthFactorStatus: null,
    isLoading: false,
  }),
  useAaveBorrowedAssets: () => ({
    borrowedAssets: [],
    hasLoans: false,
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
    mockReorderedOrder = null;
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

    expect(vaultIds(result.current.collateralVaults)).toEqual([
      VAULT_C,
      VAULT_A,
      VAULT_B,
    ]);
    // Each row's liquidationIndex (used for the "Liquidation Order" ordinal)
    // is rewritten to the override rank, so the badge matches the row position
    // instead of showing the stale indexer index.
    expect(
      result.current.collateralVaults.map((v) => v.liquidationIndex),
    ).toEqual([0, 1, 2]);
    const indexByVault = new Map(
      result.current.collateralVaults.map((v) => [
        v.vaultId,
        v.liquidationIndex,
      ]),
    );
    expect(indexByVault.get(VAULT_C)).toBe(0);
    expect(indexByVault.get(VAULT_A)).toBe(1);
    expect(indexByVault.get(VAULT_B)).toBe(2);
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
});
