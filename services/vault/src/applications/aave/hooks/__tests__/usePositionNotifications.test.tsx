/**
 * Tests for usePositionNotifications — verifies the cascade is priced at the
 * Spoke oracle's BTC price, and the live-HF urgency guardrail layered on top
 * of the calculator output.
 */

import { renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";
import { parseBtcToSatoshis } from "@/utils/btcConversion";

const mockUseDashboardState = vi.fn();
vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: (...args: unknown[]) => mockUseDashboardState(...args),
}));

const mockUsePrices = vi.fn();
vi.mock("@/hooks/usePrices", () => ({
  usePrices: (...args: unknown[]) => mockUsePrices(...args),
}));

const mockUseAaveReservePrice = vi.fn();
vi.mock("../useAaveReservePrice", () => ({
  useAaveReservePrice: (...args: unknown[]) => mockUseAaveReservePrice(...args),
}));

const SPOKE = "0x5b0e000000000000000000000000000000000001";
const VBTC_RESERVE_ID = 2n;
vi.mock("../../context", () => ({
  useAaveConfig: () => ({
    config: { coreSpokeAddress: SPOKE, vaultBtcReserveId: VBTC_RESERVE_ID },
  }),
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
    amountSats: parseBtcToSatoshis(String(amountBtc)),
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
  positionError?: Error | null;
  healthFactorReceivedAt?: number;
}

/** When the default Spoke price last changed; the default position read is newer. */
const SPOKE_PRICE_CHANGED_AT = 1_000_000;
/** "Now" in these tests: the default position read is 5s old. */
const NOW = SPOKE_PRICE_CHANGED_AT + 10_000;
/** Past the 90s position staleness threshold, measured from the default read. */
const STALE_NOW = SPOKE_PRICE_CHANGED_AT + 5_000 + 91_000;

function setDashboardState(overrides: DashboardStateOverrides = {}) {
  mockUseDashboardState.mockReturnValue({
    collateralVaults: [makeVault(VAULT_A, 0.5, 0), makeVault(VAULT_B, 0.5, 1)],
    debtValueUsd: 30_000,
    healthFactor: 2.0,
    isLoading: false,
    indexerError: null,
    positionError: null,
    healthFactorReceivedAt: SPOKE_PRICE_CHANGED_AT + 5_000,
    ...overrides,
  });
}

function setHappyPrices() {
  mockUsePrices.mockReturnValue({
    prices: { BTC: 60_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  });
}

function setSpokeBtcPrice(priceUsd: number) {
  mockUseAaveReservePrice.mockReturnValue({
    priceUsd,
    isLoading: false,
    isPriceStale: false,
    error: null,
    priceChangedAt: SPOKE_PRICE_CHANGED_AT,
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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    setHappyPrices();
    setSpokeBtcPrice(60_000);
    setHappySplitParams();
    setPegInConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("reports params-unavailable when the read succeeded but the bonus curve is out of range", () => {
    // The shape a bad curve actually produces now: params present, collateral
    // factor intact for the borrow and repay pre-sign checks, and no query
    // error — only the bonus is missing. Keyed on the value, so an empty
    // reason string cannot strand this on "loading".
    setDashboardState();
    mockUseVaultSplitParams.mockReturnValue({
      params: {
        THF: 1.08,
        expectedHF: 0.99,
        CF: 0.78,
        LB: null,
        lbUnavailableReason: "",
        maxLB: 1.0555,
      },
      isLoading: false,
      error: null,
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

  it("reports no-vaults rather than stale-price when a depositor without active vaults has a stale price", () => {
    setDashboardState({ collateralVaults: [], debtValueUsd: 0 });
    mockUsePrices.mockReturnValue({
      prices: { BTC: 60_000 },
      metadata: { BTC: { isStale: true, fetchFailed: false } },
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("no-vaults");
  });

  it("reports stale-price for a position with active vaults when the price is stale", () => {
    setDashboardState();
    mockUsePrices.mockReturnValue({
      prices: { BTC: 60_000 },
      metadata: { BTC: { isStale: true, fetchFailed: false } },
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("stale-price");
    expect(result.current.result).toBeNull();
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

  it("forces the returned live warning itself into the result when live HF is below 1.0", () => {
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      // Tiny debt → calculator alone would not flag urgent.
      debtValueUsd: 100,
      healthFactor: 0.95,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("ready");
    expect(result.current.liveUrgentWarning).not.toBeNull();
    // Same object, not a copy: the top banner compares by reference.
    expect(result.current.result?.warnings[0]).toBe(
      result.current.liveUrgentWarning,
    );
  });

  it("titles a live health factor of 0.996 as 0.99, not as the 1.00 threshold", () => {
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 0.996,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.liveUrgentWarning?.title).toBe(
      COPY.liquidationWarnings.liveHealthFactor.title("0.99"),
    );
  });

  it("forces an urgent warning when live HF is just inside the calculator's urgent band", () => {
    // The calculator is urgent within 5% of liquidation: HF below
    // 1 / 0.95 ≈ 1.0526.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 1.052,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(
      result.current.result?.warnings.some((w) => w.type === "urgent"),
    ).toBe(true);
  });

  it("does not force an urgent warning when live HF is just outside the calculator's urgent band", () => {
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 1.053,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.liveUrgentWarning).toBeNull();
  });

  it("keeps only the calculator's approaching warning when the live HF is exactly 1.0", () => {
    // Large debt → calculator's own URGENT_DISTANCE_PCT rule fires (4.8%
    // away). The Spoke cannot liquidate at exactly 1.0, so its warning does
    // not replace the calculator's.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.approachingTitle("4.8"),
    ]);
  });

  it("replaces the calculator's approaching warning with the live warning when the live HF is below 1.0", () => {
    // The calculator still sees a 4.8% buffer at the $60k Spoke price while
    // the Spoke's health factor already allows liquidation.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 0.98,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const warnings = result.current.result?.warnings;
    // Only the calculator's urgent warning is replaced: the single-vault cliff
    // warning, which carries the add-BTC action, stays.
    expect(warnings?.map((w) => w.type)).toEqual(["urgent", "cliff"]);
    expect(warnings?.[0]).toBe(result.current.liveUrgentWarning);
  });

  it("keeps the calculator's liquidatable warning when the live HF is also below 1.0", () => {
    // Debt above the collateral's borrowing power at the $60k Spoke price →
    // the calculator itself says liquidation can trigger now.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 43_000,
      healthFactor: 0.98,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    ]);
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
    "keeps the live warning without calculations when indexed rows are incomplete: $collateralVaults.length indexed rows",
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

  it("prices the cascade at the Spoke oracle's BTC price, not the dApp's Chainlink read", () => {
    // 1 BTC at a 0.8 collateral factor against $40k of debt liquidates at
    // $50k. The dApp's Chainlink read says $50k; the Spoke values BTC at $75k.
    mockUsePrices.mockReturnValue({
      prices: { BTC: 50_000 },
      metadata: { BTC: { isStale: false, fetchFailed: false } },
    });
    setSpokeBtcPrice(75_000);
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, expectedHF: 0.95, CF: 0.8, LB: 1.05, maxLB: 1.05 },
      isLoading: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.5,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(mockUseAaveReservePrice).toHaveBeenCalledWith({
      spokeAddress: SPOKE,
      reserveId: VBTC_RESERVE_ID,
    });
    expect(result.current.params?.btcPrice).toBe(75_000);
    expect(result.current.reorderVerificationContext?.btcPrice).toBe(75_000);
    expect(
      result.current.result?.warnings.some((w) => w.type === "urgent"),
    ).toBe(false);
  });

  it("drops the calculator's urgent warning when a fresh live HF is outside the urgent band", () => {
    // The calculator's price puts this position exactly at its $50k
    // liquidation price, while the Spoke's newer read says health factor 1.5.
    setSpokeBtcPrice(50_000);
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, expectedHF: 0.95, CF: 0.8, LB: 1.05, maxLB: 1.05 },
      isLoading: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.5,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.result?.warnings.map((w) => w.type)).toEqual([
      "cliff",
    ]);
  });

  it("keeps the calculator's urgent warning when the live HF read is older than the staleness threshold", () => {
    vi.setSystemTime(STALE_NOW);
    setSpokeBtcPrice(50_000);
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, expectedHF: 0.95, CF: 0.8, LB: 1.05, maxLB: 1.05 },
      isLoading: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.5,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    ]);
  });

  it("keeps the calculator's urgent warning when the last position refetch failed", () => {
    setSpokeBtcPrice(50_000);
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, expectedHF: 0.95, CF: 0.8, LB: 1.05, maxLB: 1.05 },
      isLoading: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.5,
      positionError: new Error("RPC failure"),
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    ]);
  });

  it("keeps the calculator's urgent warning while a refocused tab refetches its hour-old live HF", () => {
    // Back from a hidden tab, the Spoke price has landed at $50k while the
    // position refetch is still in flight: the cached health factor of 1.5
    // was read an hour earlier.
    setSpokeBtcPrice(50_000);
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, expectedHF: 0.95, CF: 0.8, LB: 1.05, maxLB: 1.05 },
      isLoading: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.5,
      healthFactorReceivedAt: SPOKE_PRICE_CHANGED_AT - 3_600_000,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    ]);
  });

  it("keeps the calculator's urgent warning when the live HF was read before the Spoke price last changed", () => {
    // Positions poll every 30s and the price every minute: a health factor
    // read 20s before the price moved is not stale, but is older.
    setSpokeBtcPrice(50_000);
    mockUseVaultSplitParams.mockReturnValue({
      params: { THF: 1.1, expectedHF: 0.95, CF: 0.8, LB: 1.05, maxLB: 1.05 },
      isLoading: false,
    });
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 40_000,
      healthFactor: 1.5,
      healthFactorReceivedAt: SPOKE_PRICE_CHANGED_AT - 20_000,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    ]);
  });

  it("drops the calculator's urgent warning from a dust position when a fresh live HF is outside the urgent band", () => {
    // 0.01 BTC against $350 of debt at a 0.7 collateral factor liquidates at
    // $50k, the calculator's price. A dust position only shows with an urgent
    // warning, so dropping it hides the banner.
    setSpokeBtcPrice(50_000);
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 0.01, 0)],
      debtValueUsd: 350,
      healthFactor: 1.5,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.result?.warnings.map((w) => w.type)).toEqual([
      "dust",
    ]);
  });

  it("replaces the calculator's liquidatable warning with the live warning when a fresh live HF is at or above 1.0", () => {
    // $43k of debt against 1 BTC at a 0.7 collateral factor is past its
    // ~$61.4k liquidation price at $60k, while the Spoke reads 1.02 and
    // cannot liquidate yet.
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 43_000,
      healthFactor: 1.02,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const warnings = result.current.result?.warnings;
    expect(warnings?.map((w) => w.type)).toEqual(["urgent", "cliff"]);
    expect(warnings?.[0]).toBe(result.current.liveUrgentWarning);
  });

  it("keeps the calculator's liquidatable warning when the live HF at or above 1.0 is stale", () => {
    vi.setSystemTime(STALE_NOW);
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 43_000,
      healthFactor: 1.02,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    const urgentTitles = result.current.result?.warnings
      .filter((w) => w.type === "urgent")
      .map((w) => w.title);
    expect(urgentTitles).toEqual([
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    ]);
  });

  it("still adds the live warning from a stale live HF read", () => {
    vi.setSystemTime(STALE_NOW);
    setDashboardState({
      collateralVaults: [makeVault(VAULT_A, 1.0, 0)],
      debtValueUsd: 100,
      healthFactor: 0.95,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.result?.warnings[0]).toBe(
      result.current.liveUrgentWarning,
    );
  });

  it("reports stale-price when the Spoke oracle price read fails while Chainlink is healthy", () => {
    setDashboardState();
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: false,
      isPriceStale: false,
      error: new Error("execution reverted"),
      priceChangedAt: 0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("stale-price");
    expect(result.current.result).toBeNull();
    expect(result.current.params).toBeNull();
    expect(result.current.reorderVerificationContext).toBeNull();
  });

  it("stays loading while the Spoke oracle price is loading", () => {
    setDashboardState();
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: null,
      isLoading: true,
      isPriceStale: false,
      error: null,
      priceChangedAt: 0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("loading");
    expect(result.current.result).toBeNull();
  });

  it("stays loading while the Spoke oracle price is a carried-over placeholder", () => {
    setDashboardState();
    mockUseAaveReservePrice.mockReturnValue({
      priceUsd: 58_000,
      isLoading: false,
      isPriceStale: true,
      error: null,
      priceChangedAt: 0,
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("loading");
    expect(result.current.result).toBeNull();
  });

  it("exposes the Spoke BTC price, not the Chainlink one, for a depositor with no active vaults", () => {
    mockUsePrices.mockReturnValue({
      prices: { BTC: 50_000 },
      metadata: { BTC: { isStale: false, fetchFailed: false } },
    });
    setDashboardState({ collateralVaults: [], debtValueUsd: 0 });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.status).toBe("no-vaults");
    expect(result.current.btcPriceUsd).toBe(60_000);
  });

  it("withholds the Spoke BTC price while the Chainlink round is stale", () => {
    setDashboardState({ collateralVaults: [], debtValueUsd: 0 });
    mockUsePrices.mockReturnValue({
      prices: { BTC: 60_000 },
      metadata: { BTC: { isStale: true, fetchFailed: false } },
    });

    const { result } = renderHook(() => usePositionNotifications(USER));

    expect(result.current.btcPriceUsd).toBeNull();
  });
});
