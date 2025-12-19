/**
 * Aave Position Transactions Service
 *
 * Orchestrates transaction operations for Aave positions.
 * Handles add collateral, borrow, repay, withdraw, and redeem operations.
 */

import type {
  Address,
  Chain,
  Hash,
  Hex,
  TransactionReceipt,
  WalletClient,
} from "viem";

import { ERC20 } from "../../../clients/eth-contract";
import { MAX_UINT256 } from "../../../constants";
import { AaveControllerTx, AaveSpoke } from "../clients";
import { getAaveControllerAddress } from "../config";
import { FULL_REPAY_BUFFER_BPS } from "../constants";

import { fetchAaveConfig } from "./fetchConfig";
import { getReserveById, getVbtcReserveId } from "./reserveService";

/**
 * Result of adding collateral
 */
export interface AddCollateralResult {
  transactionHash: Hash;
  receipt: TransactionReceipt;
}

/**
 * Add collateral to a Core Spoke position
 *
 * Creates a new position or adds to existing position.
 * Uses the vBTC reserve ID from config.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param vaultIds - Array of vault IDs to use as collateral
 * @returns Transaction result
 */
export async function addCollateral(
  walletClient: WalletClient,
  chain: Chain,
  vaultIds: Hex[],
): Promise<AddCollateralResult> {
  const reserveId = await getVbtcReserveId();

  const result = await AaveControllerTx.addCollateralToCorePosition(
    walletClient,
    chain,
    getAaveControllerAddress(),
    vaultIds,
    reserveId,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Borrow from a Core Spoke position
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param positionId - Position ID to borrow against
 * @param debtReserveId - Reserve ID for the asset to borrow
 * @param amount - Amount to borrow (in debt token decimals)
 * @returns Transaction result
 */
export async function borrow(
  walletClient: WalletClient,
  chain: Chain,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const result = await AaveControllerTx.borrowFromCorePosition(
    walletClient,
    chain,
    getAaveControllerAddress(),
    positionId,
    debtReserveId,
    amount,
    userAddress,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Approve debt token for repayment
 *
 * User must approve the controller to spend debt tokens before repaying.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the debt token
 * @param amount - Amount to approve (use max uint256 for unlimited)
 * @returns Transaction result
 */
export async function approveForRepay(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  amount?: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const reserve = await getReserveById(debtReserveId);
  if (!reserve) {
    throw new Error(`Reserve ${debtReserveId} not found`);
  }

  // TODO: Instead of max uint256, calculate the exact amount needed plus a small
  // buffer for interest accrual (e.g., amount + 1% buffer). This is safer and
  // follows best practices for token approvals. The buffer accounts for interest
  // that may accrue between approval and repayment transaction.
  const approvalAmount = amount ?? MAX_UINT256;

  return ERC20.approveERC20(
    walletClient,
    chain,
    reserve.token.address,
    getAaveControllerAddress(),
    approvalAmount,
  );
}

/**
 * Repay debt to a Core Spoke position (low-level)
 *
 * User must have approved the controller to spend debt tokens first.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param controllerAddress - Aave controller contract address
 * @param positionId - Position ID with debt
 * @param debtReserveId - Reserve ID for the debt token
 * @param amount - Amount to repay (in debt token decimals)
 * @returns Transaction result
 */
export async function repay(
  walletClient: WalletClient,
  chain: Chain,
  controllerAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  if (amount <= 0n) {
    throw new Error("Repay amount must be greater than 0");
  }

  const result = await AaveControllerTx.repayToCorePosition(
    walletClient,
    chain,
    controllerAddress,
    positionId,
    debtReserveId,
    amount,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Repay a partial amount of debt
 *
 * Handles approval if needed, then executes repay.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param controllerAddress - Aave controller contract address
 * @param positionId - Position ID with debt
 * @param debtReserveId - Reserve ID for the debt token
 * @param tokenAddress - Token address for the debt
 * @param amount - Amount to repay (in debt token decimals)
 * @returns Transaction result
 */
export async function repayPartial(
  walletClient: WalletClient,
  chain: Chain,
  controllerAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  tokenAddress: Address,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  // Check existing allowance and approve if needed
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    userAddress,
    controllerAddress,
  );

  if (currentAllowance < amount) {
    await ERC20.approveERC20(
      walletClient,
      chain,
      tokenAddress,
      controllerAddress,
      amount,
    );
  }

  return repay(
    walletClient,
    chain,
    controllerAddress,
    positionId,
    debtReserveId,
    amount,
  );
}

/**
 * Repay all debt for a reserve
 *
 * Fetches exact debt from contract, handles approval, then repays.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param controllerAddress - Aave controller contract address
 * @param positionId - Position ID with debt
 * @param debtReserveId - Reserve ID for the debt token
 * @param tokenAddress - Token address for the debt
 * @param spokeAddress - Spoke contract address
 * @param proxyContract - User's proxy contract address
 * @returns Transaction result
 */
export async function repayFull(
  walletClient: WalletClient,
  chain: Chain,
  controllerAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  tokenAddress: Address,
  spokeAddress: Address,
  proxyContract: Address,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  // Fetch current debt from the contract
  const currentDebt = await AaveSpoke.getUserTotalDebt(
    spokeAddress,
    debtReserveId,
    proxyContract,
  );

  if (currentDebt === 0n) {
    throw new Error("No debt to repay");
  }

  // Add 0.01% buffer to account for interest accrual between fetching and tx execution
  // The contract will only take what's actually owed, excess stays in user's wallet
  const amountToRepay = currentDebt + currentDebt / FULL_REPAY_BUFFER_BPS;

  // Check existing allowance and approve if needed
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    userAddress,
    controllerAddress,
  );

  if (currentAllowance < amountToRepay) {
    await ERC20.approveERC20(
      walletClient,
      chain,
      tokenAddress,
      controllerAddress,
      MAX_UINT256,
    );
  }

  return repay(
    walletClient,
    chain,
    controllerAddress,
    positionId,
    debtReserveId,
    amountToRepay,
  );
}

/**
 * Withdraw all collateral from a position
 *
 * Position must have zero debt before withdrawal.
 * Releases all vaults back to Available status.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @returns Transaction result
 */
export async function withdrawAllCollateral(
  walletClient: WalletClient,
  chain: Chain,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const reserveId = await getVbtcReserveId();

  const result = await AaveControllerTx.withdrawAllCollateralFromCorePosition(
    walletClient,
    chain,
    getAaveControllerAddress(),
    reserveId,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Redeem a vault to the vault provider
 *
 * Only callable by the original depositor who still owns the vault.
 * Vault must be Available (not in use or already redeemed).
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param vaultId - Vault ID to redeem
 * @returns Transaction result
 */
export async function redeemVault(
  walletClient: WalletClient,
  chain: Chain,
  vaultId: Hex,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const result = await AaveControllerTx.depositorRedeem(
    walletClient,
    chain,
    getAaveControllerAddress(),
    vaultId,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Check if position can withdraw collateral
 *
 * Position can only withdraw if it has no debt.
 *
 * @param proxyAddress - User's proxy contract address
 * @param reserveId - Reserve ID to check
 * @returns true if can withdraw
 */
export async function canWithdraw(
  proxyAddress: Address,
  reserveId: bigint,
): Promise<boolean> {
  const config = await fetchAaveConfig();
  if (!config) {
    return false;
  }

  const spokeAddress = config.btcVaultCoreSpokeAddress as Address;
  const hasDebt = await AaveSpoke.hasDebt(
    spokeAddress,
    reserveId,
    proxyAddress,
  );

  return !hasDebt;
}
