/**
 * Live borrow APRs for the landing (disconnected) APR row.
 *
 * Resolves the advertised reserves (USDT/USDC/wBTC) from the Aave config and
 * reads each one's current borrow APR from the Hub. Wallet-less: both reads
 * run against the indexer / public RPC, so the values render while no wallet
 * is connected.
 */

import { useMemo } from "react";

import { useAaveConfig } from "@/applications/aave/context";
import { useAaveBorrowAprs } from "@/applications/aave/hooks";
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

  const advertisedReserves = useMemo(
    () =>
      borrowableReserves.filter((r) =>
        LANDING_APR_SYMBOLS.includes(r.token.symbol.toUpperCase()),
      ),
    [borrowableReserves],
  );

  const { aprPercentByReserveId } = useAaveBorrowAprs({
    reserves: advertisedReserves,
  });

  return useMemo(() => {
    const aprForSymbol = (symbol: string): string | undefined => {
      const reserve = advertisedReserves.find(
        (r) => r.token.symbol.toUpperCase() === symbol,
      );
      if (!reserve) return undefined;
      const aprPercent = aprPercentByReserveId[reserve.reserveId.toString()];
      return aprPercent == null ? undefined : formatAprPercent(aprPercent);
    };

    return {
      usdt: aprForSymbol("USDT"),
      usdc: aprForSymbol("USDC"),
      wbtc: aprForSymbol("WBTC"),
    };
  }, [advertisedReserves, aprPercentByReserveId]);
}
