/**
 * God-mode store for the Borrowing Markets Data page (dev / QA only — surfaced
 * inside the god-mode panel, gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * Unlike demoDeposit's per-item galleries, this store injects at the RAW
 * hook-data layer the page reads from (`reserves` + the three
 * `Record<reserveIdString, …>` maps + the on-chain collateral factor), not at
 * the derived-strings layer. The page's own derivation (USD conversion,
 * bps→percent, compact formatting, empty-placeholder fallbacks) still runs
 * against these fixtures, so the preview shows exactly what production would
 * render for this data — including the degraded (null price / null liquidity)
 * cells, which are the hardest states to reproduce against live devnet
 * reserves.
 *
 * Same inert-when-off contract as every other god-mode store: `enabled`
 * starts false, so merely enabling the feature flag injects nothing, and
 * `useDemoMarketData` collapses to a compile-time constant `null` in a
 * production build (see `useDemoLoan` in demoDeposit.ts for the same pattern).
 */

import { useMemo, useSyncExternalStore } from "react";
import type { Address } from "viem";

import { BPS_SCALE } from "@/applications/aave/constants";
import type { ReserveLiquidity } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import featureFlags from "@/config/featureFlags";

/** Everything the page derives `rows` / `stats` / the collateral card from. */
export interface DemoMarketData {
  reserves: AaveReserveConfig[];
  liquidityByReserveId: Record<string, ReserveLiquidity | null>;
  aprPercentByReserveId: Record<string, number | null>;
  pricesByReserveId: Record<string, number | null>;
  /** Decimal fraction (e.g. 0.75), same unit as `useVaultSplitParams`'s `CF`. */
  collateralFactor: number;
}

// --- Fixture reserve config (shared, non-financial fields) -----------------

/** Fake Hub address — no on-chain reads happen against demo fixtures. */
const DEMO_HUB_ADDRESS: Address = `0x${"ab".repeat(20)}` as Address;
const DEMO_DYNAMIC_CONFIG_KEY = 0;
const DEMO_COLLATERAL_RISK = 0;
/** On-chain-style per-reserve collateral factor field — unused by this page
 *  (the page reads the protocol-wide CF from `useVaultSplitParams` instead),
 *  kept consistent with {@link DEMO_MARKET_COLLATERAL_FACTOR} so it can't read
 *  as a contradictory fixture if ever surfaced elsewhere. */
const DEMO_MARKET_COLLATERAL_FACTOR = 0.75;
const DEMO_RESERVE_COLLATERAL_FACTOR_BPS =
  DEMO_MARKET_COLLATERAL_FACTOR * BPS_SCALE;

interface DemoReserveFixture {
  reserveId: bigint;
  symbol: string;
  name: string;
  decimals: number;
  address: Address;
}

function makeDemoReserve(fixture: DemoReserveFixture): AaveReserveConfig {
  return {
    reserveId: fixture.reserveId,
    reserve: {
      underlying: fixture.address,
      hub: DEMO_HUB_ADDRESS,
      assetId: Number(fixture.reserveId),
      decimals: fixture.decimals,
      dynamicConfigKey: DEMO_DYNAMIC_CONFIG_KEY,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: DEMO_COLLATERAL_RISK,
      collateralFactor: DEMO_RESERVE_COLLATERAL_FACTOR_BPS,
    },
    token: {
      address: fixture.address,
      symbol: fixture.symbol,
      name: fixture.name,
      decimals: fixture.decimals,
    },
  };
}

// --- USDC — the reference row, matched to the Figma frame's figures --------

const USDC_DECIMALS = 6;
const USDC_PRICE_USD = 1;
const USDC_AVAILABLE_LIQUIDITY = 11_400_000;
const USDC_TOTAL_BORROWED = 24_100_000;
const USDC_SUPPLIED_LIQUIDITY = 35_500_000;
const USDC_UTILIZATION_BPS = 6800;
const USDC_APR_PERCENT = 3.5;

const DEMO_USDC_RESERVE = makeDemoReserve({
  reserveId: 9001n,
  symbol: "USDC",
  name: "USD Coin",
  decimals: USDC_DECIMALS,
  address: `0x${"a1".repeat(20)}` as Address,
});

// --- USDT — the degraded row: liquidity/utilization read failed ------------

const USDT_DECIMALS = 6;
const USDT_PRICE_USD = 1;
const USDT_APR_PERCENT = 4.1;

const DEMO_USDT_RESERVE = makeDemoReserve({
  reserveId: 9002n,
  symbol: "USDT",
  name: "Tether USD",
  decimals: USDT_DECIMALS,
  address: `0x${"b2".repeat(20)}` as Address,
});

// --- WBTC — the degraded row: oracle price read failed ---------------------

const WBTC_DECIMALS = 8;
const WBTC_AVAILABLE_LIQUIDITY = 120;
const WBTC_TOTAL_BORROWED = 45;
const WBTC_SUPPLIED_LIQUIDITY = 165;
const WBTC_UTILIZATION_BPS = 2727;
const WBTC_APR_PERCENT = 2.8;

const DEMO_WBTC_RESERVE = makeDemoReserve({
  reserveId: 9003n,
  symbol: "WBTC",
  name: "Wrapped BTC",
  decimals: WBTC_DECIMALS,
  address: `0x${"c3".repeat(20)}` as Address,
});

const DEMO_RESERVES: AaveReserveConfig[] = [
  DEMO_USDC_RESERVE,
  DEMO_USDT_RESERVE,
  DEMO_WBTC_RESERVE,
];

const DEMO_LIQUIDITY_BY_RESERVE_ID: Record<string, ReserveLiquidity | null> = {
  [DEMO_USDC_RESERVE.reserveId.toString()]: {
    availableLiquidity: USDC_AVAILABLE_LIQUIDITY,
    totalBorrowed: USDC_TOTAL_BORROWED,
    suppliedLiquidity: USDC_SUPPLIED_LIQUIDITY,
    utilizationBps: USDC_UTILIZATION_BPS,
  },
  // Null liquidity entry — previews the row's empty-placeholder path for a
  // failed liquidity/utilization read.
  [DEMO_USDT_RESERVE.reserveId.toString()]: null,
  [DEMO_WBTC_RESERVE.reserveId.toString()]: {
    availableLiquidity: WBTC_AVAILABLE_LIQUIDITY,
    totalBorrowed: WBTC_TOTAL_BORROWED,
    suppliedLiquidity: WBTC_SUPPLIED_LIQUIDITY,
    utilizationBps: WBTC_UTILIZATION_BPS,
  },
};

const DEMO_APR_BY_RESERVE_ID: Record<string, number | null> = {
  [DEMO_USDC_RESERVE.reserveId.toString()]: USDC_APR_PERCENT,
  [DEMO_USDT_RESERVE.reserveId.toString()]: USDT_APR_PERCENT,
  [DEMO_WBTC_RESERVE.reserveId.toString()]: WBTC_APR_PERCENT,
};

const DEMO_PRICES_BY_RESERVE_ID: Record<string, number | null> = {
  [DEMO_USDC_RESERVE.reserveId.toString()]: USDC_PRICE_USD,
  [DEMO_USDT_RESERVE.reserveId.toString()]: USDT_PRICE_USD,
  // Null price — previews the row's/stat's USD-cell empty-placeholder path
  // for a failed oracle read (token-unit cells still render).
  [DEMO_WBTC_RESERVE.reserveId.toString()]: null,
};

const DEMO_MARKET_DATA: DemoMarketData = {
  reserves: DEMO_RESERVES,
  liquidityByReserveId: DEMO_LIQUIDITY_BY_RESERVE_ID,
  aprPercentByReserveId: DEMO_APR_BY_RESERVE_ID,
  pricesByReserveId: DEMO_PRICES_BY_RESERVE_ID,
  collateralFactor: DEMO_MARKET_COLLATERAL_FACTOR,
};

// --- Cross-component store (the panel writes; the page reads) --------------

let enabled = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDemoMarketDataEnabled(value: boolean) {
  enabled = value;
  emit();
}

function getEnabledSnapshot() {
  return enabled;
}

function useDemoMarketDataEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    getEnabledSnapshot,
    getEnabledSnapshot,
  );
}

/**
 * Demo market data to substitute into the Borrowing Markets Data page, or
 * null to use the live reads. The literal `import.meta.env.DEV` lets the
 * bundler drop this branch (and the fixtures above) from a production build.
 */
export function useDemoMarketData(): DemoMarketData | null {
  const isEnabled = useDemoMarketDataEnabled();
  const flagOn = featureFlags.isGodModePanelEnabled;
  return useMemo(
    () =>
      import.meta.env.DEV && flagOn && isEnabled ? DEMO_MARKET_DATA : null,
    [flagOn, isEnabled],
  );
}
