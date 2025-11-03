/**
 * Deposit Hooks
 *
 * Business logic hooks for deposit operations.
 * These hooks orchestrate the deposit flow and manage state.
 */

export { useDepositFlow } from "./useDepositFlow";
export type {
  DepositFlowState,
  DepositStep,
  UseDepositFlowResult,
} from "./useDepositFlow";

export { useDepositValidation } from "./useDepositValidation";
export type { UseDepositValidationResult } from "./useDepositValidation";

export { useDepositTransaction } from "./useDepositTransaction";
export type {
  CreateDepositTransactionParams,
  TransactionResult,
  UseDepositTransactionResult,
} from "./useDepositTransaction";

// Compatibility layer for migration
export { useDepositFlow as useDepositFlowCompat } from "./useDepositFlowCompat";
export type { 
  UseDepositFlowParams as UseDepositFlowCompatParams,
  UseDepositFlowReturn as UseDepositFlowCompatReturn
} from "./useDepositFlowCompat";
