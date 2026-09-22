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

// The hook reads the minimum peg-in through the shared peg-in config query.
const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
vi.mock("@/context/ProtocolParamsContext", () => ({
  pegInConfigQueryOptions: () => ({ queryKey: ["pegInConfig"] }),
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
    lifecycle: "active",
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
  indexerError?: Error | null;
}

function setDashboardState(overrides: DashboardStateOverrides = {}) {
  mockUseDashboardState.mockReturnValue({
    collateralVaults: [makeVault(VAULT_A, 0.5, 0), makeVault(VAULT_B, 0.5, 1)],
    debtValueUsd: 30_000,
    healthFactor: 2.0,
    isLoading: false,
    indexerError: null,
    ...overrides,
  });
}

function setHappyPrices() {
  mockUsePrices.mockReturnValue({
    prices: { BTC: 60_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  });
}

function setHappySplitParams() {
  mockUseVaultSplitParams.mockReturnValue({
    params: { THF: 1.1, expectedHF: 0.95, CF: 0.7, LB: 1.05, maxLB: 1.05 },
    isLoading: false,
  });
}

function setPegInConfig() {
  mockUseQuery.mockReturnValue({
    data: { minimumPegInAmount: 5_460_000n },
    isLoading: false,
  });
}

describe("usePositionNotifications — live-HF urgency guardrail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHappyPrices();
    setHappySplitParams();
    setPegInConfig();
  });

  it("passes the protocol minimum peg-in to the calculator in BTC", () => {
    setDashboardState();

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.params?.minPeginBtc).toBe(0.0546);
    expect(result.current.reorderVerificationContext?.minPeginBtc).toBe(0.0546);
  });

  it("still computes every warning, unfloored, when the peg-in configuration read fails", () => {
    setDashboardState();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("RPC failure"),
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(result.current.result).not.toBeNull();
    expect(result.current.params?.minPeginBtc).toBeNull();
  });

  it("reports params-unavailable when the split-parameter read has failed", () => {
    setDashboardState();
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: false,
      error: new RangeError("healthFactorForMaxBonus out of range"),
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("params-unavailable");
    expect(result.current.result).toBeNull();
  });

  it("reports no-vaults rather than params-unavailable when there is nothing to warn about", () => {
    setDashboardState({ collateralVaults: [] });
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: false,
      error: new RangeError("healthFactorForMaxBonus out of range"),
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("no-vaults");
  });

  it("stays loading while the split-parameter read is still in flight", () => {
    setDashboardState();
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("loading");
  });

  it("stays loading until the peg-in configuration has loaded", () => {
    setDashboardState();
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("loading");
    expect(result.current.result).toBeNull();
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

  // Optimistic activating rows are collateral the contract has not seen yet.
  // Counting them inflates the collateral the cascade thinks is seizable, which
  // pushes every liquidation price DOWN — the position reads safer than it is.
  it("excludes optimistic activating vaults from the calculator inputs", () => {
    const activating: CollateralVaultEntry = {
      ...makeVault(VAULT_B, 5, Number.MAX_SAFE_INTEGER),
      lifecycle: "activating",
    };
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 0.5, 0), activating],
      debtValueUsd: 30_000,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(result.current.params?.vaults.map((v) => v.id)).toEqual([VAULT_A]);
    // The sentinel index would otherwise surface as "Vault 9007199254740992".
    expect(result.current.params?.vaults.map((v) => v.name)).toEqual([
      "Vault 1",
    ]);
  });

  it("excludes a withdrawing vault from the calculator inputs", () => {
    const withdrawing: CollateralVaultEntry = {
      ...makeVault(VAULT_B, 5, 1),
      lifecycle: "withdrawing",
    };
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 0.5, 0), withdrawing],
      debtValueUsd: 30_000,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(result.current.params?.vaults.map((v) => v.id)).toEqual([VAULT_A]);
    expect(result.current.params?.vaults.map((v) => v.btc)).toEqual([0.5]);
  });

  it("reports no vaults when every collateral row is still activating", () => {
    setDashboardState({
      collateralVaults: [
        { ...makeVault(VAULT_A, 0.5, 0), lifecycle: "activating" },
      ],
      debtValueUsd: 30_000,
      healthFactor: 0.95,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("no-vaults");
    expect(result.current.result).toBeNull();
    expect(result.current.params).toBeNull();
    expect(result.current.reorderVerificationContext).toBeNull();
    expect(result.current.liveUrgentWarning?.type).toBe("urgent");
  });

  it.each([
    { collateralVaults: [] },
    { collateralVaults: [makeVault(VAULT_A, 0.5, 0)] },
  ])(
    "keeps the live warning without calculations when indexed rows are incomplete: %j",
    ({ collateralVaults }) => {
      setDashboardState({
        collateralVaults,
        healthFactor: 0.95,
        indexerError: new Error("Indexed collateral is incomplete"),
      });

      const { result } = renderHook(() => usePositionNotifications(USER));

      expect(result.current.status).toBe("incomplete-position");
      expect(result.current.result).toBeNull();
      expect(result.current.params).toBeNull();
      expect(result.current.reorderVerificationContext).toBeNull();
      expect(result.current.liveUrgentWarning?.type).toBe("urgent");
    },
  );

  it("does not create a live warning without a health factor", () => {
    setDashboardState({ healthFactor: null, collateralVaults: [] });
    const { result } = renderHook(() => usePositionNotifications(USER));
    expect(result.current.liveUrgentWarning).toBeNull();
  });
});
