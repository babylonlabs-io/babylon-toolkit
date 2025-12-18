import type { Address } from "viem";

import { ENV } from "../../config/env";

export const MORPHO_APP_ID = "morpho";

/**
 * Morpho contract function names
 * Centralized constants for contract interactions
 */
export const MORPHO_FUNCTION_NAMES = {
  /** Redeem BTC vault */
  REDEEM: "redeemBTCVault",
  /** Add collateral to position (without borrowing) */
  ADD_COLLATERAL: "addCollateralToPosition",
  /** Add collateral and borrow in one transaction */
  ADD_COLLATERAL_AND_BORROW: "addCollateralToPositionAndBorrow",
  /** Withdraw all collateral from position */
  WITHDRAW_ALL_COLLATERAL: "withdrawAllCollateralFromPosition",
  /** Borrow from existing position */
  BORROW: "borrowFromPosition",
  /** Repay debt from position */
  REPAY: "repayFromPosition",
  /** Repay debt directly to Morpho using shares */
  REPAY_DIRECTLY: "repayDirectlyToMorpho",
} as const;

export const MORPHO_CONTRACTS = {
  MORPHO_CONTROLLER: ENV.MORPHO_CONTROLLER as Address,
  MORPHO: ENV.MORPHO as Address,
  FUNCTION_NAMES: MORPHO_FUNCTION_NAMES,
} as const;

export function getMorphoControllerAddress(): Address {
  return MORPHO_CONTRACTS.MORPHO_CONTROLLER;
}
