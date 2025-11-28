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

export { useEstimatedBtcFee } from "./useEstimatedBtcFee";
export { useEstimatedEthFee } from "./useEstimatedEthFee";
export { useVaultActions } from "./useVaultActions";
export type {
  BroadcastPeginParams,
  SignPayoutParams,
  UseVaultActionsReturn,
} from "./useVaultActions";

// Export from the new context-based state
export {
  DepositStep as DepositStateStep,
  useDepositState,
} from "../../context/deposit/DepositState";
export type { DepositStateData } from "../../context/deposit/DepositState";

// Keep the old hook result type for backwards compatibility
export type { UseDepositStateResult } from "./useDepositState";

// Compatibility layer for migration
export { useDepositFlow as useDepositFlowCompat } from "./useDepositFlowCompat";
export type {
  UseDepositFlowParams as UseDepositFlowCompatParams,
  UseDepositFlowReturn as UseDepositFlowCompatReturn,
} from "./useDepositFlowCompat";
