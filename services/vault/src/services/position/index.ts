/**
 * Position Service - Re-exports
 */

export * from "./positionService";
export * from "./positionTransactionService";

// Re-export types from clients for architectural boundaries
export type { MarketPosition } from "../../clients/eth-contract";
