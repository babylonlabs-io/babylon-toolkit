import type { LoanTab } from "@/applications/aave/constants";

export const ROUTES = {
  OVERVIEW: "/",
  VAULTS: "/vaults",
  LOANS: "/loans",
  ACTIVITY: "/activity",
  LIQUIDATIONS: "/liquidations",
  EXPLORE: "/explore",
  MARKETS: "/markets",
} as const;

/** Path param carrying the asset symbol on the borrowing-markets-data route. */
export const MARKET_SYMBOL_PARAM = "symbol";

export const RESERVE_QUERY_KEYS = {
  RESERVE_ID: "reserve",
  TAB: "tab",
  /**
   * Selects the loan overlay's asset-picker step (`borrow` | `repay`). Route
   * state rather than component state so the whole loan flow drives one dialog
   * — see `applications/aave/components/Detail` (`LoanFlowOverlay`).
   */
  PICKER: "picker",
} as const;

export function getReserveDetailBaseRoute(isV3Enabled: boolean): string {
  return isV3Enabled ? ROUTES.LOANS : ROUTES.OVERVIEW;
}

/** Asset picker step of the loan overlay. */
export function getAssetPickerRoute(tab: LoanTab, isV3Enabled: boolean) {
  const params = new URLSearchParams({ [RESERVE_QUERY_KEYS.PICKER]: tab });
  return `${getReserveDetailBaseRoute(isV3Enabled)}?${params.toString()}`;
}

export function getReserveDetailRoute(
  reserveId: string,
  tab: LoanTab,
  isV3Enabled: boolean,
) {
  const baseRoute = getReserveDetailBaseRoute(isV3Enabled);
  const params = new URLSearchParams({
    [RESERVE_QUERY_KEYS.RESERVE_ID]: reserveId.toLowerCase(),
    [RESERVE_QUERY_KEYS.TAB]: tab,
  });
  return `${baseRoute}?${params.toString()}`;
}

/** Borrowing markets data page for one borrowable asset. */
export function getMarketDataRoute(assetSymbol: string) {
  return `${ROUTES.MARKETS}/${encodeURIComponent(assetSymbol.toLowerCase())}`;
}
