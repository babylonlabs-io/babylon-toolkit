import type { Address } from "viem";

import { ENV } from "../../config/env";
import { toAddress } from "../../utils/addressUtils";

export const AAVE_APP_ID = "aave";

/**
 * Aave contract function names
 * Centralized constants for contract interactions
 */
export const AAVE_FUNCTION_NAMES = {
  /** Redeem vault back to vault provider (depositorRedeem) */
  REDEEM: "depositorRedeem",
  /** Add collateral to Core Spoke position */
  ADD_COLLATERAL: "addCollateralToCorePosition",
  /** Withdraw all collateral from Core Spoke position */
  WITHDRAW_ALL_COLLATERAL: "withdrawAllCollateralFromCorePosition",
  /** Borrow from Core Spoke position */
  BORROW: "borrowFromCorePosition",
  /** Repay debt to Core Spoke position */
  REPAY: "repayToCorePosition",
} as const;

export const AAVE_CONTRACTS = {
  AAVE_CONTROLLER: toAddress(ENV.AAVE_CONTROLLER),
  FUNCTION_NAMES: AAVE_FUNCTION_NAMES,
} as const;

export function getAaveControllerAddress(): Address {
  return AAVE_CONTRACTS.AAVE_CONTROLLER;
}
