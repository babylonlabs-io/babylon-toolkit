import type { ReserveLiquidity } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";

import { createOverrideStore } from "./store";

/** Everything the Borrowing Markets Data page derives `rows` / `stats` /
 *  the collateral card from. */
export interface MarketDataOverride {
  reserves: AaveReserveConfig[];
  liquidityByReserveId: Record<string, ReserveLiquidity | null>;
  aprPercentByReserveId: Record<string, number | null>;
  pricesByReserveId: Record<string, number | null>;
  /** Decimal fraction (e.g. 0.75), same unit as `useVaultSplitParams`'s `CF`. */
  collateralFactor: number;
}

const marketDataOverrideStore = createOverrideStore<MarketDataOverride>();

export const useMarketDataOverride = marketDataOverrideStore.useValue;
export const setMarketDataOverride = marketDataOverrideStore.set;
