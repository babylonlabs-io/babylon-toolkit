/**
 * Activity type definitions for vault operations
 *
 * VaultActivity represents both pegin/deposit activities and borrowing positions.
 * Different fields are populated based on the context:
 * - Pegin/Deposit (VaultDeposit tab): contractStatus, isPending
 * - Position (VaultPositions tab): morphoPosition, borrowingData, marketData
 *
 * Note: Display status (label/variant) is derived from contractStatus via peginStateMachine,
 * not stored directly on the activity.
 */

import type { Hex } from "viem";

/**
 * Vault activity - represents both deposits and borrowing positions
 */
export interface VaultActivity {
  /** Unique identifier (txHash or positionId) */
  id: string;

  /** Collateral information */
  collateral: {
    amount: string;
    symbol: string;
    icon?: string;
  };

  /** Vault providers */
  providers: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;

  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };

  // === Pegin/Deposit fields (VaultDeposit tab) ===

  /** Transaction hash (pegin tx) */
  txHash?: Hex;

  /** Contract status (0=Pending, 1=Verified, 2=Available, 3=InPosition, 4=Expired) */
  contractStatus?: number;

  /** Pending peg-in flags */
  isPending?: boolean;
  pendingMessage?: string;

  // === Position fields (VaultPositions tab) ===

  /** Morpho position data */
  morphoPosition?: {
    collateral: bigint;
    borrowShares: bigint;
    borrowed: bigint;
    borrowAssets: bigint; // Actual debt including accrued interest
  };

  /** Enriched borrowing data (calculated from morpho position + market data) */
  borrowingData?: {
    borrowedAmount: string; // Formatted borrowed amount (e.g., "1000.50 USDC")
    borrowedSymbol: string; // Token symbol (e.g., "USDC")
    currentLTV: number; // Current LTV percentage (e.g., 50.5)
    maxLTV: number; // Maximum LTV percentage (e.g., 80)
  };

  /** Market data for borrowing */
  marketData?: {
    btcPriceUSD: number; // BTC price in USD
    lltvPercent: number; // Liquidation LTV percentage
  };

  /** Position created date */
  positionDate?: Date;

  // === Shared fields ===

  /** Market ID (for repay/borrow operations) */
  marketId?: string;

  /** Timestamp (for sorting/ordering) - milliseconds since epoch */
  timestamp?: number;
}

/**
 * Legacy activity interface for simple activity displays
 */
export interface Activity {
  id: string;
  date: string;
  type: "Deposit" | "Withdraw" | "Borrow" | "Repay";
  amount: string;
  transactionHash: string;
}
