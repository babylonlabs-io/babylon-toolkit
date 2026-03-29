/**
 * Aave Integration Adapter - Transaction builders
 *
 * Provides transaction builders for the AaveIntegrationAdapter contract.
 * Only includes Core Spoke operations for regular users (no Arbitrageur operations).
 *
 * These functions return unsigned transaction parameters that can be executed
 * by the vault service using its wallet client and transaction factory.
 */

import { type Address, type Hex, encodeFunctionData } from "viem";

import { AAVE_FUNCTION_NAMES } from "../config.js";
import type { TransactionParams } from "../types.js";
import AaveIntegrationAdapterABI from "./abis/AaveIntegrationAdapter.abi.json";

/**
 * Build transaction to withdraw selected vaults from AAVE position.
 *
 * Withdraws specific vaults (partial withdrawal) and redeems them back to the depositor.
 * **Requires zero debt** - position must have no outstanding borrows.
 *
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param vaultIds - Array of vault IDs (bytes32) to withdraw
 * @returns Unsigned transaction parameters for execution with viem wallet
 */
export function buildWithdrawCollateralsTx(
  contractAddress: Address,
  vaultIds: Hex[],
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationAdapterABI,
    functionName: AAVE_FUNCTION_NAMES.WITHDRAW_COLLATERALS,
    args: [vaultIds],
  });

  return {
    to: contractAddress,
    data,
  };
}

/**
 * Build transaction to borrow assets against vBTC collateral.
 *
 * Borrows stablecoins (e.g., USDC) against your BTC collateral position.
 * Health factor must remain above 1.0 after borrowing, otherwise transaction will revert.
 *
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param debtReserveId - AAVE reserve ID for the debt asset (e.g., `2n` for USDC reserve)
 * @param amount - Amount to borrow in token units with decimals (e.g., for USDC with 6 decimals: `100000000n` = 100 USDC). Use `parseUnits()` from viem.
 * @param receiver - Address to receive borrowed tokens (usually user's address)
 * @returns Unsigned transaction parameters for execution with viem wallet
 *
 * @example
 * ```typescript
 * import { buildBorrowTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 * import { parseUnits } from "viem";
 *
 * // Borrow 100 USDC (6 decimals)
 * const borrowAmount = parseUnits("100", 6);
 *
 * const txParams = buildBorrowTx(
 *   "0x123...", // Adapter address
 *   2n, // USDC reserve ID
 *   borrowAmount,
 *   "0x456..." // Receiver address
 * );
 *
 * const hash = await walletClient.sendTransaction({
 *   to: txParams.to,
 *   data: txParams.data,
 *   chain: sepolia,
 * });
 * ```
 *
 * @remarks
 * **What happens on-chain:**
 * 1. Checks health factor won't drop below liquidation threshold (1.0)
 * 2. Mints debt tokens to user's proxy contract
 * 3. Transfers borrowed asset to receiver address
 * 4. Updates position debt
 * 5. Emits `Borrowed` event
 *
 * **Possible errors:**
 * - Borrow would make health factor < 1.0
 * - Insufficient collateral
 * - Reserve doesn't exist
 * - Position doesn't exist
 *
 * **Important:** Calculate safe borrow amount using `calculateHealthFactor()` to avoid liquidation.
 */
export function buildBorrowTx(
  contractAddress: Address,
  debtReserveId: bigint,
  amount: bigint,
  receiver: Address,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationAdapterABI,
    functionName: AAVE_FUNCTION_NAMES.BORROW,
    args: [debtReserveId, amount, receiver],
  });

  return {
    to: contractAddress,
    data,
  };
}

/**
 * Build transaction to repay debt on AAVE position.
 *
 * **Requires token approval** - user must approve adapter to spend debt token first.
 * Repays borrowed assets (partial or full repayment supported).
 *
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param borrower - Borrower's address (for self-repay, use connected wallet address)
 * @param debtReserveId - AAVE reserve ID for the debt asset
 * @param amount - Amount to repay in token units. Can repay partial or full debt. For full repay, use `getUserTotalDebt()` to get exact amount.
 * @returns Unsigned transaction parameters for execution with viem wallet
 *
 * @example
 * ```typescript
 * import { buildRepayTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * // Build repay transaction (self-repay)
 * const txParams = buildRepayTx(
 *   AAVE_ADAPTER,
 *   borrowerAddress, // Connected wallet address for self-repay
 *   USDC_RESERVE_ID,
 *   repayAmount
 * );
 *
 * const hash = await walletClient.sendTransaction({
 *   to: txParams.to,
 *   data: txParams.data,
 *   chain: sepolia,
 * });
 * ```
 *
 * @remarks
 * **What happens on-chain:**
 * 1. Transfers tokens from user to adapter (requires approval)
 * 2. Burns debt tokens from user's proxy
 * 3. Updates position debt
 * 4. Emits `Repaid` event
 *
 * **Possible errors:**
 * - Insufficient token approval
 * - User doesn't have enough tokens
 * - Repay amount exceeds debt
 * - Position doesn't exist
 */
export function buildRepayTx(
  contractAddress: Address,
  borrower: Address,
  debtReserveId: bigint,
  amount: bigint,
): TransactionParams {
  const data = encodeFunctionData({
    abi: AaveIntegrationAdapterABI,
    functionName: AAVE_FUNCTION_NAMES.REPAY,
    args: [borrower, debtReserveId, amount],
  });

  return {
    to: contractAddress,
    data,
  };
}

