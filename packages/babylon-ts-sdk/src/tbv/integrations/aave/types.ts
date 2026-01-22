/**
 * Aave Integration Types
 *
 * Core type definitions for Aave protocol interactions.
 */

import type { Address, Hex } from "viem";

/**
 * Depositor structure from contract
 */
export interface DepositorStruct {
  ethAddress: Address;
  btcPubKey: Hex;
}

/**
 * Aave position structure from the contract
 */
export interface AaveMarketPosition {
  depositor: {
    ethAddress: Address;
    btcPubKey: Hex;
  };
  reserveId: bigint;
  proxyContract: Address;
  vaultIds: Hex[];
}

/**
 * User account data from the Spoke
 * Contains aggregated position health data calculated by Aave using on-chain oracle prices.
 */
export interface AaveSpokeUserAccountData {
  /** Risk premium in BPS */
  riskPremium: bigint;
  /** Weighted average collateral factor in WAD (1e18 = 100%) */
  avgCollateralFactor: bigint;
  /** Health factor in WAD (1e18 = 1.00) */
  healthFactor: bigint;
  /** Total collateral value in base currency (1e26 = $1 USD) */
  totalCollateralValue: bigint;
  /** Total debt value in base currency (1e26 = $1 USD) */
  totalDebtValue: bigint;
  /** Number of active collateral reserves */
  activeCollateralCount: bigint;
  /** Number of borrowed reserves */
  borrowedCount: bigint;
}

/**
 * User position data from the Spoke
 */
export interface AaveSpokeUserPosition {
  /** Drawn debt shares */
  drawnShares: bigint;
  /** Premium shares (interest) */
  premiumShares: bigint;
  /** Realized premium (ray) */
  realizedPremiumRay: bigint;
  /** Premium offset (ray) */
  premiumOffsetRay: bigint;
  /** Supplied collateral shares */
  suppliedShares: bigint;
  /** Dynamic config key */
  dynamicConfigKey: number;
}

/**
 * Transaction parameters for unsigned transactions
 * Compatible with viem's transaction format
 */
export interface TransactionParams {
  /** Contract address to call */
  to: Address;
  /** Encoded function data */
  data: Hex;
  /** Value to send (optional, defaults to 0) */
  value?: bigint;
}
