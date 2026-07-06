/**
 * Types for the vault Activity tab — a single user's on-chain vault actions
 * (deposits, withdrawals, liquidations, borrows, repays, redemptions, claims).
 */

/**
 * Internal sentinel activity type for an in-flight peg-in. Kept out of the
 * filter menu and rendered as a normal "Deposit" row with a spinner.
 */
export const PENDING_DEPOSIT_TYPE = "Pending Deposit";

/**
 * Types of activities that can be recorded. Liquidation events are pre-classified
 * by `fetchActivities` into Partially / Fully Liquidated based on whether the
 * depositor had remaining open vaults at the moment of liquidation.
 */
export type ActivityType =
  | "Deposit"
  | "Withdraw"
  | "Partially Liquidated"
  | "Fully Liquidated"
  | "Borrow"
  | "Repay"
  | "Redeem"
  | typeof PENDING_DEPOSIT_TYPE;

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
 * A single activity row (deposit, borrow, repay, etc.). Liquidation rows are
 * rolled up into LiquidationGroupRow instead — they do not appear as ActivityLog.
 */
export interface ActivityLog {
  kind: "row";
  /** Unique identifier for the activity */
  id: string;
  /** Timestamp of the activity */
  date: Date;
  /** Source URL for the left avatar. BTC icon for native rows, reserve token icon for borrow/repay. */
  tokenIcon: string;
  /**
   * Whether the deposit expired before activation and was reclaimed via the
   * peg-in refund path. Shown as a red dot with the "Deposit expired" tooltip.
   */
  isExpired?: boolean;
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

/** A nested child row inside a LiquidationGroupRow. Same visual fields as
 *  ActivityLog but renders inside the expandable parent. */
export interface LiquidationChildRow {
  id: string;
  /** Display label, e.g. "Collateral Liquidated", "Loan Repaid". */
  label: string;
  amount: ActivityAmount;
  tokenIcon: string;
  chain: ActivityChain;
  transactionHash: string;
  date: Date;
}

/** A liquidation rolled up into one expandable card with child events. */
export interface LiquidationGroupRow {
  kind: "liquidationGroup";
  id: string;
  date: Date;
  /** "Partially Liquidated" when the depositor still had open vaults right
   *  after this liquidation; "Fully Liquidated" otherwise. */
  type: "Partially Liquidated" | "Fully Liquidated";
  /** Dual avatar — collateral icon and debt icon, in that order. */
  tokenIcons: [string, string];
  /** "0.5 BTC / 10,000 USDC" formatted into the parent card subtitle. */
  summary: {
    collateral: ActivityAmount;
    debt: ActivityAmount | null;
  };
  children: LiquidationChildRow[];
  transactionHash: string;
}

/** Anything the Activity list can render. */
export type ActivityRow = ActivityLog | LiquidationGroupRow;
