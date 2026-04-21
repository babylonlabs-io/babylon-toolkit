/**
 * Deposit Hooks
 *
 * Business logic hooks for deposit operations.
 * These hooks orchestrate the deposit flow and manage state.
 */

export { useDepositFlow } from "./useDepositFlow";
export type {
  MultiVaultDepositResult,
  PeginCreationResult,
  UseDepositFlowParams,
  UseDepositFlowReturn,
} from "./useDepositFlow";

export { useDepositValidation } from "./useDepositValidation";
export type { UseDepositValidationResult } from "./useDepositValidation";

export { useEstimatedBtcFee } from "./useEstimatedBtcFee";
export { useVaultActions } from "./useVaultActions";
export type {
  BroadcastPrePeginParams,
  UseVaultActionsReturn,
} from "./useVaultActions";

// Export from the context-based state
export {
  DepositStep as DepositStateStep,
  useDepositState,
} from "../../context/deposit/DepositState";
export type { DepositStateData } from "../../context/deposit/DepositState";

// Wallet hooks
export { useBtcWalletState } from "./useBtcWalletState";

// Modal hooks
export { usePayoutSignModal } from "./usePayoutSignModal";
