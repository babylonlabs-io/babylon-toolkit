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

/** Path segment of `/markets/:reserveId` — the reserve's on-chain id. */
export const MARKET_RESERVE_PARAM = "reserveId";

export const RESERVE_QUERY_KEYS = {
  RESERVE_ID: "reserve",
  TAB: "tab",
  /** Selects the loan overlay's asset-picker step (`borrow` | `repay`). */
  PICKER: "picker",
} as const;

export function getReserveDetailBaseRoute(isV3Enabled: boolean): string {
  return isV3Enabled ? ROUTES.LOANS : ROUTES.OVERVIEW;
}

export function getAssetPickerRoute(tab: LoanTab, isV3Enabled: boolean) {
  const params = new URLSearchParams({ [RESERVE_QUERY_KEYS.PICKER]: tab });
  return `${getReserveDetailBaseRoute(isV3Enabled)}?${params.toString()}`;
}

/**
 * Only decimal digits. `BigInt` would happily accept `"0x5"`, `" 5 "` and
 * `"-1"`, and the reserve screens must treat anything that is not a plain
 * on-chain reserve id as unresolvable rather than coercing it.
 */
const NUMERIC_RESERVE_ID = /^\d+$/;

/**
 * Parse a reserve id out of a URL — either the `?reserve=` query value or the
 * `/markets/:reserveId` segment.
 *
 * Legacy links carry a token symbol (`?reserve=usdc`, `/markets/usdc`) rather
 * than an id. Those resolve to null and must hard-block: matching a symbol
 * would reopen the indexer-steering path this identifier replaced (audit F7).
 *
 * @returns The reserve id, or null when the value is absent or not a plain id.
 */
export function parseReserveId(
  param: string | null | undefined,
): bigint | null {
  if (!param || !NUMERIC_RESERVE_ID.test(param)) {
    return null;
  }
  return BigInt(param);
}

/**
 * Build the reserve detail route.
 *
 * The `reserve` query value is the reserve's on-chain id, never its token
 * symbol: the symbol comes from the indexer, so routing by it lets a
 * compromised indexer decide which reserve a link opens.
 */
export function getReserveDetailRoute(
  reserveId: bigint,
  tab: LoanTab,
  isV3Enabled: boolean,
) {
  const baseRoute = getReserveDetailBaseRoute(isV3Enabled);
  const params = new URLSearchParams({
    [RESERVE_QUERY_KEYS.RESERVE_ID]: reserveId.toString(),
    [RESERVE_QUERY_KEYS.TAB]: tab,
  });
  return `${baseRoute}?${params.toString()}`;
}

/** Keyed by reserve id for the same reason as {@link getReserveDetailRoute}. */
export function getMarketDataRoute(reserveId: bigint) {
  return `${ROUTES.MARKETS}/${reserveId.toString()}`;
}
