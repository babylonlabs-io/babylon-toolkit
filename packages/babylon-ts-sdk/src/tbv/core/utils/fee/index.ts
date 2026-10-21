/**
 * Fee calculation utilities and constants
 *
 * @module utils/fee
 */

export * from "./constants";
export {
  applyChangeOutputPolicy,
  computeChangeOutputFeeSats,
  computeMaxDeposit,
  computeMinPeginFeeSats,
  computePeginBaseFeeSats,
  type ApplyChangeOutputPolicyParams,
  type ChangeOutputPolicyResult,
  type ComputeBaseFeeParams,
  type ComputeMaxDepositParams,
} from "./peginFeeMath";
