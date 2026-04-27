/**
 * Activity log type definitions for aggregated user activities across applications
 *
 * ActivityLog represents a single user activity event (deposit, borrow, repay, etc.)
 * from any enabled application (e.g., Aave)
 */

/**
 * Types of activities that can be recorded
 */
export type ActivityType =
  | "Deposit"
  | "Withdraw"
  | "Add Collateral"
  | "Remove Collateral"
  | "Liquidation"
  | "Borrow"
  | "Repay"
  // Pending activity types (not yet confirmed on-chain)
  | "Pending Deposit";

/**
 * Chain that the transaction hash belongs to.
 * BTC — Bitcoin peg-in/peg-out transaction. Display without 0x; link to mempool.
 * ETH — Ethereum on-chain event transaction. Display with 0x; link to etherscan.
 */
export type ActivityChain = "BTC" | "ETH";

/**
 * Application information for an activity
 */
export interface ActivityApplication {
  id: string;
  /** Display name (e.g., "Aave") */
  name: string;
  /** URL to the application logo */
  logoUrl: string;
}

/**
 * Amount information for an activity
 */
export interface ActivityAmount {
  /** Formatted amount value (e.g., "15,180.32") */
  value: string;
  /** Token symbol (e.g., "USDC", "BTC") */
  symbol: string;
  /** Optional URL to the token icon */
  icon?: string;
}

/**
 * Represents a single activity log entry
 */
export interface ActivityLog {
  /** Unique identifier for the activity */
  id: string;
  /** Timestamp of the activity */
  date: Date;
  /** Application where the activity occurred */
  application: ActivityApplication;
  /** Type of activity */
  type: ActivityType;
  /** Amount involved in the activity */
  amount: ActivityAmount;
  /**
   * Chain for the user-facing transaction hash.
   * Chosen so the "Transaction Hash" column points to the most meaningful tx
   * for the activity: BTC peg-in for deposits, EVM event tx for collateral/loan ops.
   */
  chain: ActivityChain;
  /** Transaction hash to display (BTC pegin txid or EVM event tx hash). Empty string for pending without a broadcast tx. */
  transactionHash: string;
  /** Whether this is a pending transaction (not yet confirmed on-chain) */
  isPending?: boolean;
}
