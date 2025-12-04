import type { Address, Chain, Hex, WalletClient } from "viem";

export type ApplicationType = "Lending" | "Staking" | "DEX" | "Yield";

export interface ApplicationConfig {
  id: string;
  name: string;
  type: ApplicationType;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  contracts: Record<string, Address>;
}

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
}

export interface Market {
  id: string;
  applicationId: string;
  collateralToken: TokenInfo;
  loanToken: TokenInfo;
  totalSupply: bigint;
  totalBorrow: bigint;
  utilizationRate: number;
  borrowRate: number;
  liquidationLTV: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface Position {
  id: string;
  marketId: string;
  applicationId: string;
  userAddress: Address;
  collateral: bigint;
  debt: bigint;
  healthFactor?: number;
  currentLTV?: number;
  vaultIds: Hex[];
  metadata: Record<string, unknown>;
}

export interface VaultForBorrowing {
  id: Hex;
  amount: bigint;
  isAvailable: boolean;
}

export interface TransactionResult {
  hash: Hex;
  wait: () => Promise<{ status: "success" | "reverted" }>;
}

export interface DepositCollateralParams {
  vaultIds: Hex[];
  marketId: string;
}

export interface BorrowParams {
  marketId: string;
  amount: bigint;
  vaultIds?: Hex[];
}

export interface RepayParams {
  marketId: string;
  amount: bigint;
  isFullRepay?: boolean;
}

export interface WithdrawParams {
  marketId: string;
  amount?: bigint;
}

export interface IApplicationAdapter {
  readonly id: string;
  readonly config: ApplicationConfig;

  initialize(): Promise<void>;
  isInitialized(): boolean;

  getMarkets(): Promise<Market[]>;
  getMarketById(marketId: string): Promise<Market | null>;
  getMarketBorrowRate(marketId: string): Promise<number>;

  getUserPositions(userAddress: Address): Promise<Position[]>;
  getUserPositionForMarket(
    userAddress: Address,
    marketId: string,
  ): Promise<Position | null>;

  getVaultsAvailableForBorrowing(
    userAddress: Address,
  ): Promise<VaultForBorrowing[]>;

  depositCollateral(
    walletClient: WalletClient,
    chain: Chain,
    params: DepositCollateralParams,
  ): Promise<TransactionResult>;

  borrow(
    walletClient: WalletClient,
    chain: Chain,
    params: BorrowParams,
  ): Promise<TransactionResult>;

  repay(
    walletClient: WalletClient,
    chain: Chain,
    params: RepayParams,
  ): Promise<TransactionResult>;

  withdrawCollateral(
    walletClient: WalletClient,
    chain: Chain,
    params: WithdrawParams,
  ): Promise<TransactionResult>;

  getCollateralPriceUSD(marketId: string): Promise<number>;
}
