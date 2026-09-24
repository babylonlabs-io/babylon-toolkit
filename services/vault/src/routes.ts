import { getAddress, isAddress, type Address } from "viem";

import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";

export const ROUTES = {
  OVERVIEW: "/",
  VAULTS: "/vaults",
  LOANS: "/loans",
  ACTIVITY: "/activity",
  LIQUIDATIONS: "/liquidations",
  EXPLORE: "/explore",
  MARKETS: "/markets",
} as const;

/** Path segment of `/markets/:reserveId` — see {@link getMarketDataRoute}. */
export const MARKET_RESERVE_PARAM = "reserveId";

export const RESERVE_QUERY_KEYS = {
  RESERVE_ID: "reserve",
  TAB: "tab",
  /** Selects the loan overlay's asset-picker step (`borrow` | `repay`). */
  PICKER: "picker",
  /**
   * Underlying token chosen in Select asset. Carried to Select hub and on to
   * the borrow form, whose back arrow returns there. Navigation only: it never
   * resolves a reserve, which always comes from `RESERVE_ID`.
   */
  ASSET: "asset",
} as const;

/**
 * Query string that opens the loan overlay's asset picker. Search-only: the
 * overlay renders over whichever page under the Aave layout is already
 * mounted, so opening it must not change the pathname — a route change paints
 * the destination page first and the user sees it flash behind the dialog.
 * Pair with the current pathname (see `useLoanActions`).
 */
export function getAssetPickerSearch(tab: LoanTab) {
  return `?${new URLSearchParams({ [RESERVE_QUERY_KEYS.PICKER]: tab })}`;
}

/**
 * Full route to the asset picker, for the one caller that genuinely leaves its
 * page to get there (the market data page's back link). In-page entry points
 * use `getAssetPickerSearch` instead.
 */
export function getAssetPickerRoute(tab: LoanTab) {
  return `${ROUTES.LOANS}${getAssetPickerSearch(tab)}`;
}

/**
 * Query string that opens Select hub for one token: the borrow picker, narrowed
 * to the reserves whose underlying is `underlying`. Search-only, like
 * {@link getAssetPickerSearch}.
 */
export function getHubPickerSearch(underlying: Address) {
  return `?${new URLSearchParams({
    [RESERVE_QUERY_KEYS.PICKER]: LOAN_TAB.BORROW,
    [RESERVE_QUERY_KEYS.ASSET]: underlying,
  })}`;
}

/** The asset picker step the search selects (`?picker=`), or null for none. */
export function parseLoanPicker(searchParams: URLSearchParams): LoanTab | null {
  const picker = searchParams.get(RESERVE_QUERY_KEYS.PICKER);
  return picker === LOAN_TAB.BORROW || picker === LOAN_TAB.REPAY
    ? picker
    : null;
}

/**
 * Whether the search opens the loan overlay, at a reserve form or an asset
 * picker. `AaveOverlayLayout` renders the overlay on exactly this condition.
 */
export function opensLoanFlow(searchParams: URLSearchParams): boolean {
  return (
    Boolean(searchParams.get(RESERVE_QUERY_KEYS.RESERVE_ID)) ||
    parseLoanPicker(searchParams) !== null
  );
}

/**
 * Parse the `?asset=` underlying address.
 *
 * @returns The checksummed address, or null when absent or not an address.
 */
export function parseAssetParam(
  param: string | null | undefined,
): Address | null {
  if (!param || !isAddress(param, { strict: false })) {
    return null;
  }
  return getAddress(param);
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
 * Query string that opens the loan overlay's borrow / repay form for a reserve.
 * Search-only, like {@link getAssetPickerSearch}.
 *
 * The `reserve` query value is the reserve's on-chain id, never its token
 * symbol: the symbol comes from the indexer, so routing by it lets a
 * compromised indexer decide which reserve a link opens. `asset` records that
 * the form was reached through the pickers, so the borrow form can offer a way
 * back to them.
 */
export function getReserveDetailSearch(
  reserveId: bigint,
  tab: LoanTab,
  asset?: Address,
) {
  return `?${new URLSearchParams({
    [RESERVE_QUERY_KEYS.RESERVE_ID]: reserveId.toString(),
    [RESERVE_QUERY_KEYS.TAB]: tab,
    ...(asset ? { [RESERVE_QUERY_KEYS.ASSET]: asset } : {}),
  })}`;
}

/**
 * Route to a reserve's market data page, addressed by the reserve's on-chain
 * id. Not by token symbol: one token can be listed on several hubs, each a
 * separate market, and two hubs can even list different tokens that share a
 * symbol. The id is unambiguous by construction, and the page still proves the
 * reserve's identity against the chain before anything renders.
 */
export function getMarketDataRoute(reserveId: bigint) {
  return `${ROUTES.MARKETS}/${reserveId.toString()}`;
}
