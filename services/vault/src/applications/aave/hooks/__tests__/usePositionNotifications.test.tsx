/**
 * Tests for usePositionNotifications — verifies the live-HF urgency
 * guardrail layered on top of the calculator output.
 */

import { renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollateralVaultEntry } from "@/types/collateral";

const mockUseDashboardState = vi.fn();
vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: (...args: unknown[]) => mockUseDashboardState(...args),
}));

const mockUsePrices = vi.fn();
vi.mock("@/hooks/usePrices", () => ({
  usePrices: (...args: unknown[]) => mockUsePrices(...args),
}));

const mockUseVaultSplitParams = vi.fn();
vi.mock("../useVaultSplitParams", () => ({
  useVaultSplitParams: (...args: unknown[]) => mockUseVaultSplitParams(...args),
}));

const mockUseVaultCountCap = vi.fn();
vi.mock("@/hooks/useVaultCountCap", () => ({
  useVaultCountCap: (...args: unknown[]) => mockUseVaultCountCap(...args),
}));

// The cascade warnings are gated behind this flag; default it ON so the
// existing live-HF tests exercise the cascade. Max-vaults tests below flip it.
const flag = vi.hoisted(() => ({ liquidation: true }));
vi.mock("@/config", () => ({
  FeatureFlags: {
    get isLiquidationNotificationsEnabled() {
      return flag.liquidation;
    },
  },
}));

import { usePositionNotifications } from "../usePositionNotifications";

const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;

const USER = "0xuser" as const;

function makeVault(
  vaultId: Hex,
  amountBtc: number,
  liquidationIndex: number,
): CollateralVaultEntry {
  return {
    id: vaultId,
    vaultId,
    amountBtc,
    addedAt: 0,
    inUse: true,
    providerAddress: "0xprovider",
    providerName: "Test VP",
    liquidationIndex,
  };
}

interface DashboardStateOverrides {
  collateralVaults?: CollateralVaultEntry[];
  debtValueUsd?: number;
  healthFactor?: number | null;
  isLoading?: boolean;
}

function setDashboardState(overrides: DashboardStateOverrides = {}) {
  mockUseDashboardState.mockReturnValue({
    collateralVaults: overrides.collateralVaults ?? [
      makeVault(VAULT_A, 0.5, 0),
      makeVault(VAULT_B, 0.5, 1),
    ],
    debtValueUsd: overrides.debtValueUsd ?? 30_000,
    healthFactor: overrides.healthFactor ?? 2.0,
    isLoading: overrides.isLoading ?? false,
  });
}

function setHappyPrices() {
  mockUsePrices.mockReturnValue({
    prices: { BTC: 60_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  });
}

function setHappySplitParams() {
  flag.liquidation = true;
  mockUseVaultSplitParams.mockReturnValue({
    params: { CF: 0.7, THF: 1.1, LB: 1.05 },
    isLoading: false,
  });
  mockUseVaultCountCap.mockReturnValue({
    maxVaults: null,
    currentCount: 0,
    isAtCap: false,
    capUnavailable: false,
  });
}

describe("usePositionNotifications — live-HF urgency guardrail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHappyPrices();
    setHappySplitParams();
  });

  it("forces an urgent warning when live HF is below 1.0", () => {
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      // Tiny debt → calculator alone would not flag urgent.
      debtValueUsd: 100,
      healthFactor: 0.95,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(
      result.current.result?.warnings.some((w) => w.type === "urgent"),
    ).toBe(true);
  });

  it("forces an urgent warning when live HF is at the 1.05 threshold", () => {
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 1.05,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(
      result.current.result?.warnings.some((w) => w.type === "urgent"),
    ).toBe(true);
  });

  it("does not duplicate the urgent warning when the calculator already produced one", () => {
    // Large debt → calculator's own URGENT_DISTANCE_PCT rule fires.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentCount =
      result.current.result?.warnings.filter((w) => w.type === "urgent")
        .length ?? 0;
    expect(urgentCount).toBe(1);
  });

  it("does not force urgent for a healthy live HF", () => {
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 2.0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(
      result.current.result?.warnings.some((w) => w.type === "urgent"),
    ).toBe(false);
  });

  it("returns ready with no spurious warnings when HF is healthy", () => {
    setDashboardState({
      collateralVaults: [
        makeVault(VAULT_A, 0.5, 0),
        makeVault(VAULT_B, 0.5, 1),
      ],
      debtValueUsd: 100,
      healthFactor: 5.0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(
      result.current.result?.warnings.some((w) => w.type === "urgent"),
    ).toBe(false);
  });
});

describe("usePositionNotifications — max-vaults injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHappyPrices();
    setHappySplitParams();
  });

  it("injects max-vaults at the cap even with zero debt AND the flag off (always-on)", () => {
    flag.liquidation = false; // cascade off — max-vaults must still show
    mockUseVaultCountCap.mockReturnValue({
      maxVaults: 1,
      currentCount: 1,
      isAtCap: true,
      capUnavailable: false,
    });
    // Zero debt → calculate() early-exits with no cascade warnings; the
    // max-vaults advisory must still be injected (position-capacity fact).
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 0.5, 0)],
      debtValueUsd: 0,
      healthFactor: null,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(
      result.current.result?.warnings.some((w) => w.type === "max-vaults"),
    ).toBe(true);
  });

  it("strips cascade warnings when the flag is off, keeping only max-vaults", () => {
    flag.liquidation = false;
    mockUseVaultCountCap.mockReturnValue({
      maxVaults: 1,
      currentCount: 1,
      isAtCap: true,
      capUnavailable: false,
    });
    // A live HF below threshold would normally inject an urgent cascade
    // warning — but with the flag off only max-vaults should remain.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 0.95,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));
    const types = result.current.result?.warnings.map((w) => w.type) ?? [];
    expect(types).toEqual(["max-vaults"]);
  });

  it("does not inject max-vaults below the cap", () => {
    mockUseVaultCountCap.mockReturnValue({
      maxVaults: 5,
      currentCount: 1,
      isAtCap: false,
      capUnavailable: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 0.5, 0)],
      debtValueUsd: 30_000,
      healthFactor: 2.0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(
      result.current.result?.warnings.some((w) => w.type === "max-vaults"),
    ).toBe(false);
  });
});
