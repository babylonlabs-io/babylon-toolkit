/**
 * Aave Integration Controller - Transaction builders
 *
 * Provides transaction builders for the AaveIntegrationController contract.
 * Only includes Core Spoke operations for regular users (no Arbitrageur operations).
 *
 * These functions return unsigned transaction parameters that can be executed
 * by the vault service using its wallet client and transaction factory.
 */

import { type Address, type Hex, encodeFunctionData } from "viem";

import { AAVE_FUNCTION_NAMES } from "../config.js";
import type { TransactionParams } from "../types.js";
import AaveIntegrationControllerABI from "./abis/AaveIntegrationController.abi.json";

/**
 * Build transaction to add collateral to Core Spoke position
 *
 * Creates a new position or adds to existing position for the given reserve.
 * User's proxy is deployed on first position creation.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param vaultIds - Array of vault IDs (pegin tx hashes) to use as collateral
 * @param reserveId - Aave reserve ID for the collateral
 * @returns Unsigned transaction parameters
 */
export function buildAddCollateralTx(
  contractAddress: Address,
  vaultIds: Hex[],
  reserveId: bigint,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationControllerABI,
    functionName: AAVE_FUNCTION_NAMES.ADD_COLLATERAL,
    args: [vaultIds, reserveId],
  });

  return {
    to: contractAddress,
    data,
  };
}

/**
 * Build transaction to withdraw all collateral from Core Spoke position
 *
 * Withdraws all vBTC collateral and releases vaults back to Available status.
 * Position must have zero debt before withdrawal.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param reserveId - Aave reserve ID for the collateral
 * @returns Unsigned transaction parameters
 */
export function buildWithdrawAllCollateralTx(
  contractAddress: Address,
  reserveId: bigint,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationControllerABI,
    functionName: AAVE_FUNCTION_NAMES.WITHDRAW_ALL_COLLATERAL,
    args: [reserveId],
  });

  return {
    to: contractAddress,
    data,
  };
}

/**
 * Build transaction to borrow from Core Spoke position
 *
 * Borrows assets against vBTC collateral position.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID to borrow against
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to borrow
 * @param receiver - Address to receive borrowed tokens
 * @returns Unsigned transaction parameters
 */
export function buildBorrowTx(
  contractAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
  receiver: Address,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationControllerABI,
    functionName: AAVE_FUNCTION_NAMES.BORROW,
    args: [positionId, debtReserveId, amount, receiver],
  });

  return {
    to: contractAddress,
    data,
  };
}

/**
 * Build transaction to repay debt to Core Spoke position
 *
 * Repays debt on a position. User must have approved the controller to spend
 * the debt token.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID with debt
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to repay
 * @returns Unsigned transaction parameters
 */
export function buildRepayTx(
  contractAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationControllerABI,
    functionName: AAVE_FUNCTION_NAMES.REPAY,
    args: [positionId, debtReserveId, amount],
  });

  return {
    to: contractAddress,
    data,
  };
}

/**
 * Build transaction to redeem vault to vault provider (for original depositors)
 *
 * Only callable by the original depositor who still owns the vault.
 * Vault must be Available (not in use or already redeemed).
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param vaultId - Vault ID to redeem
 * @returns Unsigned transaction parameters
 */
export function buildDepositorRedeemTx(
  contractAddress: Address,
  vaultId: Hex,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationControllerABI,
    functionName: AAVE_FUNCTION_NAMES.REDEEM,
    args: [vaultId],
  });

  return {
    to: contractAddress,
    data,
  };
}
