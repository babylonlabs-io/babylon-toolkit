import type { Address } from 'viem';

export type MarketTokenRef = {
  address: Address;
  symbol: string;
};

export type MorphoMarketSummary = {
  id: string;
  address: Address;
  tokens: {
    loan: MarketTokenRef;
    collateral: MarketTokenRef;
  };
  lltvPercent: number;
  totalMarketSizeAssets: bigint;
  totalLiquidityAssets: bigint;
  utilizationPercent: number;
};

