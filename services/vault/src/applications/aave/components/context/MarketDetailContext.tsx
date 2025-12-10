import { createContext, useContext } from "react";

export interface BorrowableVault {
  amountSatoshis: bigint;
}

interface TokenInfo {
  name: string;
  symbol: string;
  icon: string;
}

interface TokenPair {
  pairName: string;
  collateral: TokenInfo;
  loan: TokenInfo;
}

export interface MarketDetailContextValue {
  btcPrice: number;
  liquidationLtv: number;
  currentLoanAmount: number;
  currentCollateralAmount: number;
  borrowableVaults?: BorrowableVault[];
  availableLiquidity: number;
  tokenPair: TokenPair;
}

const defaultContext: MarketDetailContextValue = {
  btcPrice: 60000,
  liquidationLtv: 75,
  currentLoanAmount: 0,
  currentCollateralAmount: 0,
  borrowableVaults: [],
  availableLiquidity: 1_000_000,
  tokenPair: {
    pairName: "BTC/USDC",
    collateral: {
      name: "Bitcoin",
      symbol: "BTC",
      icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
    },
    loan: {
      name: "USD Coin",
      symbol: "USDC",
      icon: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png?1696507229",
    },
  },
};

const MarketDetailContext = createContext<MarketDetailContextValue | null>(
  null,
);

interface ProviderProps {
  children: React.ReactNode;
  value?: Partial<MarketDetailContextValue>;
}

export function MarketDetailProvider({ children, value }: ProviderProps) {
  const mergedValue = { ...defaultContext, ...value };
  return (
    <MarketDetailContext.Provider value={mergedValue}>
      {children}
    </MarketDetailContext.Provider>
  );
}

export function useMarketDetailContext(): MarketDetailContextValue {
  const ctx = useContext(MarketDetailContext);
  if (!ctx) {
    throw new Error(
      "useMarketDetailContext must be used within a MarketDetailProvider",
    );
  }
  return ctx;
}
