import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultsPageData } from "@/hooks/useVaultsPageData";
import type { CollateralVaultEntry } from "@/types/collateral";

function makeVault(
  overrides: Partial<CollateralVaultEntry> & { id: string },
): CollateralVaultEntry {
  return {
    vaultId: `vault-${overrides.id}`,
    amountBtc: 0.5,
    addedAt: 0,
    inUse: true,
    providerAddress: "0xprovider",
    providerName: "Provider",
    liquidationIndex: 0,
    ...overrides,
  };
}

const dashboardState = vi.hoisted(() => ({
  displayCollateralBtc: 0,
  collateralBtc: 0,
  collateralValueUsd: 0,
  healthFactor: null as number | null,
  healthFactorStatus: "no_debt",
  collateralVaults: [] as CollateralVaultEntry[],
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: () => dashboardState,
}));

const demoState = vi.hoisted(() => ({
  current: null as {
    vaults: CollateralVaultEntry[];
    hideReal: boolean;
  } | null,
}));

vi.mock("@/dev/demoDeposit", () => ({
  useDemoCollateral: () => demoState.current,
}));

describe("useVaultsPageData", () => {
  beforeEach(() => {
    dashboardState.displayCollateralBtc = 0;
    dashboardState.collateralBtc = 0;
    dashboardState.collateralValueUsd = 0;
    dashboardState.collateralVaults = [];
    demoState.current = null;
  });

  it("passes real entries through untouched when no demo is active", () => {
    const real = [makeVault({ id: "a", amountBtc: 0.6 })];
    dashboardState.collateralVaults = real;
    dashboardState.displayCollateralBtc = 0.6;

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.displayVaults).toEqual(real);
    expect(result.current.rawCollateralVaults).toEqual(real);
    expect(result.current.summary.activeVaultsCount).toBe(1);
    expect(result.current.summary.totalCollateralBtc).toContain("0.6");
  });

  it("prepends demo rows to the display list but never to the raw list", () => {
    const real = [makeVault({ id: "real", amountBtc: 0.6 })];
    const demoRow = makeVault({
      id: "demo",
      amountBtc: 0.1,
      displayOnly: true,
    });
    dashboardState.collateralVaults = real;
    demoState.current = { vaults: [demoRow], hideReal: false };

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.displayVaults).toEqual([demoRow, ...real]);
    expect(result.current.rawCollateralVaults).toEqual(real);
  });

  it("drops real rows from display when the demo hides them", () => {
    const real = [makeVault({ id: "real", amountBtc: 0.6 })];
    const demoRow = makeVault({
      id: "demo",
      amountBtc: 0.1,
      displayOnly: true,
    });
    dashboardState.collateralVaults = real;
    demoState.current = { vaults: [demoRow], hideReal: true };

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.displayVaults).toEqual([demoRow]);
    expect(result.current.rawCollateralVaults).toEqual(real);
  });

  it("totals the rendered rows when the demo changes the collateral list", () => {
    dashboardState.collateralVaults = [
      makeVault({ id: "real", amountBtc: 0.6 }),
    ];
    dashboardState.displayCollateralBtc = 0.6;
    demoState.current = {
      vaults: [makeVault({ id: "demo", amountBtc: 0.4, displayOnly: true })],
      hideReal: false,
    };

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.summary.totalCollateralBtc).toContain("1");
  });

  it("builds the liquidation-order sequence for two or more vaults", () => {
    dashboardState.collateralVaults = [
      makeVault({ id: "a", amountBtc: 0.6, liquidationIndex: 0 }),
      makeVault({ id: "b", amountBtc: 0.2, liquidationIndex: 1 }),
    ];

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.summary.liquidationOrder).toContain("0.6 → 0.2");
    expect(result.current.summary.liquidationOrder).toMatch(/^Order: /);
  });

  it("omits the liquidation order for a single vault", () => {
    dashboardState.collateralVaults = [makeVault({ id: "a", amountBtc: 0.6 })];

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.summary.liquidationOrder).toBeNull();
  });

  it("keeps optimistic activating rows out of the liquidation-order sequence", () => {
    dashboardState.collateralVaults = [
      makeVault({ id: "a", amountBtc: 0.6, liquidationIndex: 0 }),
      makeVault({ id: "b", amountBtc: 0.2, liquidationIndex: 1 }),
      makeVault({ id: "activating", amountBtc: 0.3, isActivating: true }),
    ];

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.summary.liquidationOrder).toContain("0.6 → 0.2");
    expect(result.current.summary.liquidationOrder).not.toContain("0.3");
    // The count still includes the activating row, matching the Active
    // Vaults section header.
    expect(result.current.summary.activeVaultsCount).toBe(3);
  });

  it("omits the liquidation order when only one row has an established position", () => {
    dashboardState.collateralVaults = [
      makeVault({ id: "a", amountBtc: 0.6, liquidationIndex: 0 }),
      makeVault({ id: "activating", amountBtc: 0.3, isActivating: true }),
    ];

    const { result } = renderHook(() => useVaultsPageData("0xdepositor"));

    expect(result.current.summary.liquidationOrder).toBeNull();
  });
});
