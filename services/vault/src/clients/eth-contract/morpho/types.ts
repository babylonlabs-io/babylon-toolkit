import type { Address } from "viem";

export type MorphoMarketSummary = {
  /** Market ID */
  id: string;
  /** Loan token address (USDC) */
  loanToken: Address;
  /** Collateral token address (BTC Vault) */
  collateralToken: Address;
  /** Oracle address for price feed */
  oracle: Address;
  /** Liquidation Loan-to-Value ratio (raw value with 18 decimals) */
  lltv: bigint;
  /** Total assets supplied to the market */
  totalSupplyAssets: bigint;
  /** Total assets borrowed from the market */
  totalBorrowAssets: bigint;
  /** Utilization percentage (calculated: totalBorrow / totalSupply * 100) */
  utilizationPercent: number;
  /** LLTV as percentage (calculated: lltv / 1e16) */
  lltvPercent: number;
};

export type MorphoUserPosition = {
  marketId: string;
  user: Address;
  supplyShares: bigint;
  borrowShares: bigint;
  borrowAssets: bigint; // Actual debt amount including accrued interest
  collateral: bigint;
};
