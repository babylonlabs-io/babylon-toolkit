/**
 * Types for the vault Activity tab — a single user's on-chain vault actions
 * (deposits, withdrawals, liquidations, borrows, repays, redemptions, claims).
 */

/**
 * Types of activities that can be recorded
 */
export type ActivityType =
  | "Deposit"
  | "Withdraw"
  | "Liquidation"
  | "Borrow"
  | "Repay"
  | "Redeem"
  | "Claim Expired"
  | "Pending Deposit";

/**
 * Chain that the transaction hash belongs to.
 * BTC — Bitcoin peg-in/peg-out transaction. Display without 0x; link to mempool.
 * ETH — Ethereum on-chain event transaction. Display with 0x; link to etherscan.
 */
export type ActivityChain = "BTC" | "ETH";

/**
 * Amount information for an activity
 */
export interface ActivityAmount {
  /** Formatted amount value (e.g., "15,180.32") */
  value: string;
  /** Token symbol (e.g., "USDC", "BTC") */
  symbol: string;
}

/**
 * Represents a single activity log entry
 */
export interface ActivityLog {
  /** Unique identifier for the activity */
  id: string;
  /** Timestamp of the activity */
  date: Date;
  /** Source URL for the left avatar. BTC icon for native rows, reserve token icon for borrow/repay. */
  tokenIcon: string;
  /** Whether the deposit was refunded via the peg-in refund path. Shown as a red dot with tooltip. */
  isRefunded?: boolean;
  /** Type of activity */
  type: ActivityType;
  /** Amount involved in the activity */
  amount: ActivityAmount;
  /**
   * Chain for the user-facing transaction hash.
   * Chosen so the "Transaction Hash" column points to the most meaningful tx for the activity.
   */
  chain: ActivityChain;
  /** Transaction hash to display (BTC pegin txid or EVM event tx hash). Empty string for pending without a broadcast tx. */
  transactionHash: string;
  /** Whether this is a pending transaction (not yet confirmed on-chain) */
  isPending?: boolean;
}
