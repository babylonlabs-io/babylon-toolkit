/**
 * Live borrow APRs for the landing (disconnected) APR row.
 *
 * Resolves the advertised tokens (USDT/USDC/wBTC) from the Aave config and
 * reads each of their reserves' current borrow APR from its Hub. A token can
 * be listed on several hubs, each at its own rate, and the row advertises the
 * lowest. Wallet-less: both reads run against the indexer / public RPC, so the
 * values render while no wallet is connected.
 */

import { useMemo } from "react";

import { useAaveConfig } from "@/applications/aave/context";
import { useAaveBorrowAprs } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import { getReserveTokenLabel } from "@/applications/aave/utils/reserveTokenLabel";
import { formatAprPercent } from "@/utils/formatting";

export interface LandingBorrowAprs {
  /** Formatted APR (e.g. "3.7%") per advertised symbol; undefined until loaded. */
  usdt: string | undefined;
  usdc: string | undefined;
  wbtc: string | undefined;
}

/** Symbols advertised on the landing card, uppercased for matching. */
const LANDING_APR_SYMBOLS: readonly string[] = ["USDT", "USDC", "WBTC"];

export function useLandingBorrowAprs(): LandingBorrowAprs {
  const { borrowableReserves } = useAaveConfig();

  // Every borrowable reserve per advertised symbol, one per hub, matched on
  // the reserve's display symbol: the token registry's for a registered
  // underlying, otherwise the indexer's.
  const reservesBySymbol = useMemo(() => {
    const map = new Map<string, AaveReserveConfig[]>();
    for (const reserve of borrowableReserves) {
      const symbol = getReserveTokenLabel(reserve).symbol.toUpperCase();
      if (!LANDING_APR_SYMBOLS.includes(symbol)) continue;
      map.set(symbol, [...(map.get(symbol) ?? []), reserve]);
    }
    return map;
  }, [borrowableReserves]);

  const advertisedReserves = useMemo(
    () => Array.from(reservesBySymbol.values()).flat(),
    [reservesBySymbol],
  );

  const { aprPercentByReserveId } = useAaveBorrowAprs({
    reserves: advertisedReserves,
  });

  return useMemo(() => {
    // The lowest rate any hub offers for the token. Withheld until every hub's
    // read has settled, so the advertised figure can't drop when a slower read
    // lands; a hub whose read failed is left out.
    const aprForSymbol = (symbol: string): string | undefined => {
      const rates = (reservesBySymbol.get(symbol) ?? []).map(
        (reserve) => aprPercentByReserveId[reserve.reserveId.toString()],
      );
      if (rates.length === 0 || rates.some((rate) => rate === undefined)) {
        return undefined;
      }
      const settledRates = rates.filter((rate): rate is number => rate != null);
      return settledRates.length === 0
        ? undefined
        : formatAprPercent(Math.min(...settledRates));
    };

    return {
      usdt: aprForSymbol("USDT"),
      usdc: aprForSymbol("USDC"),
      wbtc: aprForSymbol("WBTC"),
    };
  }, [reservesBySymbol, aprPercentByReserveId]);
}
