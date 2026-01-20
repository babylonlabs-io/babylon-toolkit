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
 * Build transaction to add BTC vaults as collateral to AAVE position.
 *
 * Creates a new position on first call, or adds to existing position for the given reserve.
 * User's proxy contract is deployed automatically on first position creation.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param vaultIds - Array of vault IDs (peg-in transaction hashes) to use as collateral. Format: `0x${string}` (bytes32 hex values). Vaults must be in "Available" status.
 * @param reserveId - AAVE reserve ID for the collateral (e.g., `1n` for vBTC reserve). Get from AAVE config or indexer.
 * @returns Unsigned transaction parameters (`TransactionParams`) for execution with viem wallet
 *
 * @example
 * ```typescript
 * import { buildAddCollateralTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const txParams = buildAddCollateralTx(
 *   "0x123...", // Controller address
 *   ["0xabc...", "0xdef..."], // Vault IDs
 *   1n // vBTC reserve ID
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
 * 1. If first time: Deploys user's proxy contract via AAVE
 * 2. Transfers vault ownership from user to AAVE controller
 * 3. Vault status changes: `Available (0)` → `InUse (1)`
 * 4. Creates or updates position with new collateral
 * 5. Emits `CollateralAdded` event
 *
 * **Possible errors:**
 * - Vault already in use by another position
 * - Vault doesn't exist or already redeemed
 * - User doesn't own the vault
 * - Reserve ID invalid
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
 * Build transaction to withdraw all vBTC collateral from AAVE position.
 *
 * **Requires zero debt** - position must have no outstanding borrows across all reserves.
 * Withdraws all vBTC collateral and releases vaults back to Available status.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param reserveId - AAVE reserve ID for the collateral. Must match the reserve used when adding collateral.
 * @returns Unsigned transaction parameters for execution with viem wallet
 *
 * @example
 * ```typescript
 * import { buildWithdrawAllCollateralTx, hasDebt } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * // Check for debt first
 * const userHasDebt = await hasDebt(publicClient, spokeAddress, USDC_RESERVE_ID, proxyAddress);
 * if (userHasDebt) {
 *   throw new Error("Cannot withdraw with outstanding debt");
 * }
 *
 * const txParams = buildWithdrawAllCollateralTx("0x123...", 1n);
 * const hash = await walletClient.sendTransaction({
 *   to: txParams.to,
 *   data: txParams.data,
 *   chain: sepolia,
 * });
 * ```
 *
 * @remarks
 * **What happens on-chain:**
 * 1. Verifies user has zero debt across all reserves
 * 2. Withdraws all vBTC collateral from AAVE spoke
 * 3. Transfers vault ownership back to user
 * 4. Vault status changes: `InUse (1)` → `Available (0)`
 * 5. Emits `CollateralWithdrawn` event
 *
 * **Possible errors:**
 * - User has outstanding debt
 * - Position doesn't exist
 * - No collateral to withdraw
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
 * Build transaction to borrow assets against vBTC collateral.
 *
 * Borrows stablecoins (e.g., USDC) against your BTC collateral position.
 * Health factor must remain above 1.0 after borrowing, otherwise transaction will revert.
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID to borrow against (bytes32, from `getPosition()` or indexer)
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
 *   "0x123...", // Controller address
 *   "0xabc...", // Position ID
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
 * Build transaction to repay debt on AAVE position.
 *
 * **Requires token approval** - user must approve controller to spend debt token first.
 * Repays borrowed assets (partial or full repayment supported).
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID with debt (bytes32)
 * @param debtReserveId - AAVE reserve ID for the debt asset
 * @param amount - Amount to repay in token units. Can repay partial or full debt. For full repay, use `getUserTotalDebt()` to get exact amount.
 * @returns Unsigned transaction parameters for execution with viem wallet
 *
 * @example
 * ```typescript
 * import { buildRepayTx, getUserTotalDebt, FULL_REPAY_BUFFER_BPS } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * // Get exact current debt
 * const totalDebt = await getUserTotalDebt(
 *   publicClient,
 *   AAVE_SPOKE,
 *   USDC_RESERVE_ID,
 *   proxyAddress
 * );
 *
 * // Add buffer for full repayment (accounts for interest accrual)
 * const repayAmount = totalDebt + (totalDebt / FULL_REPAY_BUFFER_BPS);
 *
 * // IMPORTANT: Approve token spending first
 * const USDC_ADDRESS = "0x...";
 * await walletClient.writeContract({
 *   address: USDC_ADDRESS,
 *   abi: ERC20_ABI,
 *   functionName: "approve",
 *   args: [AAVE_CONTROLLER, repayAmount]
 * });
 *
 * // Build repay transaction
 * const txParams = buildRepayTx(
 *   AAVE_CONTROLLER,
 *   positionId,
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
 * 1. Transfers tokens from user to controller (requires approval)
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
 * Build transaction to redeem BTC vault back to Bitcoin network.
 *
 * **Depositor-only operation** - Only callable by the original depositor who created the vault.
 * Vault must be in "Available" status (not in use by AAVE or already redeemed).
 *
 * @param contractAddress - AaveIntegrationController contract address
 * @param vaultId - Vault ID to redeem (bytes32, peg-in transaction hash)
 * @returns Unsigned transaction parameters for execution with viem wallet
 *
 * @example
 * ```typescript
 * import { buildDepositorRedeemTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * const vaultId = "0xabc..."; // From your pegin transaction
 *
 * const txParams = buildDepositorRedeemTx(
 *   "0x123...", // Controller address
 *   vaultId
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
 * 1. Verifies caller is the original depositor
 * 2. Verifies vault is in "Available" status
 * 3. Burns the vault NFT
 * 4. Vault status changes: `Available (0)` → `Redeemed (2)`
 * 5. Initiates Bitcoin withdrawal to depositor's BTC address
 * 6. Emits `VaultRedeemed` event
 *
 * **Possible errors:**
 * - Vault in use by AAVE position
 * - Vault already redeemed
 * - Caller is not the depositor
 * - Vault doesn't exist
 *
 * **After redemption:** Depositor must sign payout authorization to complete BTC withdrawal.
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
