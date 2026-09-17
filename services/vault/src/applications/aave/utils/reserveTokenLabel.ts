/**
 * Display label for a reserve's token, on surfaces that list reserves before
 * any one of them is verified: the pickers, the token dropdown, Loans and the
 * markets table.
 *
 * The address-keyed token registry comes first, looked up by the reserve's
 * underlying, which config load proves against the Core Spoke. A token the
 * registry doesn't know (testnet deployments) falls back to the indexer's
 * label. The loan form and the market page still verify the token on-chain
 * before they render an amount.
 */

import { COPY } from "@/copy";
import {
  getCurrencyIconWithFallback,
  getRegisteredTokenByAddress,
} from "@/services/token/tokenService";

import type { AaveReserveConfig } from "../services/fetchConfig";

export interface ReserveTokenLabel {
  symbol: string;
  /** Full token name (e.g. "USD Coin"); falls back to the symbol. */
  name: string;
  /** Icon URL, or the symbol-based / generated letter fallback. */
  icon: string;
}

const ADDRESS_PREFIX = "0x";
const ADDRESS_LENGTH = 42;

/** An indexer "symbol" that is really an address: the token has no `symbol()`. */
function looksLikeAddress(value: string): boolean {
  return value.startsWith(ADDRESS_PREFIX) && value.length >= ADDRESS_LENGTH;
}

export function getReserveTokenLabel(
  reserve: AaveReserveConfig,
): ReserveTokenLabel {
  const registered = getRegisteredTokenByAddress(reserve.reserve.underlying);
  if (registered) {
    return {
      symbol: registered.symbol,
      name: registered.name,
      icon: getCurrencyIconWithFallback(registered.icon, registered.symbol),
    };
  }

  const symbol = looksLikeAddress(reserve.token.symbol)
    ? COPY.loans.unknownTokenSymbol
    : reserve.token.symbol;
  return {
    symbol,
    name: reserve.token.name?.trim() || symbol,
    icon: getCurrencyIconWithFallback(undefined, symbol),
  };
}
