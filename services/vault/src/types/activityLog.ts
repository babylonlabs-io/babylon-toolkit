/**
 * Activity log type definitions for aggregated user activities across applications
 *
 * ActivityLog represents a single user activity event (deposit, borrow, repay, etc.)
 * from any enabled application (Aave, Morpho, etc.)
 */

/**
 * Types of activities that can be recorded
 */
export type ActivityType = "Deposit" | "Borrow" | "Repay" | "Withdraw";

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
  /** Transaction hash on the blockchain */
  transactionHash: string;
}
