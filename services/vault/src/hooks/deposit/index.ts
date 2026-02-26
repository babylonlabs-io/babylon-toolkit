/**
 * Deposit Hooks
 *
 * Business logic hooks for deposit operations.
 * These hooks orchestrate the deposit flow and manage state.
 */

export { useDepositFlow } from "./useDepositFlow";
export type {
  UseDepositFlowParams,
  UseDepositFlowReturn,
} from "./useDepositFlow";

export { useMultiVaultDepositFlow } from "./useMultiVaultDepositFlow";
export type {
  MultiVaultDepositResult,
  PeginCreationResult,
  SplitTxSignResult,
  UseMultiVaultDepositFlowParams,
  UseMultiVaultDepositFlowReturn,
} from "./useMultiVaultDepositFlow";

export { useAllocationPlanning } from "./useAllocationPlanning";
export type { UseAllocationPlanningResult } from "./useAllocationPlanning";

export { useDepositValidation } from "./useDepositValidation";
export type { UseDepositValidationResult } from "./useDepositValidation";

export { useEstimatedBtcFee } from "./useEstimatedBtcFee";
export { useVaultActions } from "./useVaultActions";
export type {
  BroadcastPeginParams,
  SignPayoutParams,
  UseVaultActionsReturn,
} from "./useVaultActions";

// Export from the context-based state
export {
  DepositPageStep as DepositStateStep,
  useDepositState,
} from "../../context/deposit/DepositState";
export type { DepositStateData } from "../../context/deposit/DepositState";

// Modal hooks
export { usePayoutSignModal } from "./usePayoutSignModal";
export { useRedeemModal } from "./useRedeemModal";
