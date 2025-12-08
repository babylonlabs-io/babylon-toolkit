/**
 * Market Detail Context
 * Provides market data to child components to avoid prop drilling
 */

import { createContext, useContext } from "react";

import type { MarketTokenPair } from "../../../../../services/token";
import type { BorrowableVault } from "../hooks/useVaultsForBorrowing";

export interface MarketDetailContextValue {
  btcPrice: number;
  liquidationLtv: number;
  currentLoanAmount: number;
  currentCollateralAmount: number;
  borrowableVaults?: BorrowableVault[];
  availableLiquidity: number;
  tokenPair: MarketTokenPair;
}

const MarketDetailContext = createContext<MarketDetailContextValue | null>(
  null,
);

export function MarketDetailProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: MarketDetailContextValue;
}) {
  return (
    <MarketDetailContext.Provider value={value}>
      {children}
    </MarketDetailContext.Provider>
  );
}

export function useMarketDetailContext() {
  const context = useContext(MarketDetailContext);
  if (!context) {
    throw new Error(
      "useMarketDetailContext must be used within MarketDetailProvider",
    );
  }
  return context;
}
