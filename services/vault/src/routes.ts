import type { Address } from "viem";

import type { LoanTab } from "@/applications/aave/constants";
import { getRegisteredTokenByAddress } from "@/services/token/tokenService";

export const ROUTES = {
  OVERVIEW: "/",
  VAULTS: "/vaults",
  LOANS: "/loans",
  ACTIVITY: "/activity",
  LIQUIDATIONS: "/liquidations",
  EXPLORE: "/explore",
  MARKETS: "/markets",
} as const;

/** Path segment of `/markets/:market` — see {@link getMarketSlug}. */
export const MARKET_PARAM = "market";

export const RESERVE_QUERY_KEYS = {
  RESERVE_ID: "reserve",
  TAB: "tab",
  /** Selects the loan overlay's asset-picker step (`borrow` | `repay`). */
  PICKER: "picker",
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
export function getReserveDetailRoute(reserveId: bigint, tab: LoanTab) {
  return `${ROUTES.LOANS}${getReserveDetailSearch(reserveId, tab)}`;
}

/** Search-only form of {@link getReserveDetailRoute}; same rationale, and the
 *  same id-not-symbol rule. */
export function getReserveDetailSearch(reserveId: bigint, tab: LoanTab) {
  return `?${new URLSearchParams({
    [RESERVE_QUERY_KEYS.RESERVE_ID]: reserveId.toString(),
    [RESERVE_QUERY_KEYS.TAB]: tab,
  })}`;
}

/**
 * Slug naming a reserve in `/markets/:market`: the compile-time token
 * registry's symbol for the reserve's underlying address, lowercased, falling
 * back to the on-chain id for addresses the registry does not know (testnet
 * mocks).
 *
 * Deliberately not the indexer's `token.symbol`. Link building and the page's
 * lookup both key off the registry, so a compromised indexer that rewrites a
 * reserve's underlying can only make the link resolve to nothing, never to a
 * different market — and the id/underlying pair it does resolve to is still
 * proven against the chain before anything renders
 * (`useVerifiedReserveIdentity`, audit F7).
 */
export function getMarketSlug(reserveId: bigint, underlying?: Address): string {
  const symbol = underlying
    ? getRegisteredTokenByAddress(underlying)?.symbol
    : undefined;
  return symbol ? symbol.toLowerCase() : reserveId.toString();
}

/** Route to a reserve's market data page. See {@link getMarketSlug}. */
export function getMarketDataRoute(reserveId: bigint, underlying?: Address) {
  return `${ROUTES.MARKETS}/${getMarketSlug(reserveId, underlying)}`;
}
