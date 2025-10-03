import type { Address } from 'viem';

export type MarketTokenRef = {
  address: Address;
  symbol: string;
};

export type MorphoMarketSummary = {
  id: string;
  loanToken: MarketTokenRef;
  collateralToken: MarketTokenRef;
  oracle: Address;
  irm: Address;
  lltv: bigint;
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
  utilizationPercent: number;
  lltvPercent: number;
};

