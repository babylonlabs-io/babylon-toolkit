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
import { maxUint256 } from "viem";

import { ERC20 } from "../../../clients/eth-contract";
import { AaveControllerTx, AaveSpoke } from "../clients";
import { getAaveControllerAddress } from "../config";
import { FULL_REPAY_BUFFER_BPS } from "../constants";

import { fetchAaveConfig } from "./fetchConfig";
import { getVbtcReserveId } from "./reserveService";

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

  console.group("🔍 [REPAY FULL] Transaction Details");

  // === PHASE 1: Pre-flight Checks ===
  console.group("📋 Phase 1: Pre-flight Checks");

  // Fetch current debt from the contract to verify there is debt to repay
  const currentDebt = await AaveSpoke.getUserTotalDebt(
    spokeAddress,
    debtReserveId,
    proxyContract,
  );

  if (currentDebt === 0n) {
    console.groupEnd();
    console.groupEnd();
    throw new Error("No debt to repay");
  }

  console.log("✓ Current debt (wei):", currentDebt.toString());
  console.log(
    "✓ Current debt (readable):",
    (Number(currentDebt) / 1e6).toFixed(6),
    "USDC",
  );

  // Get user's token balance
  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  console.log("✓ User balance (wei):", userBalance.toString());
  console.log(
    "✓ User balance (readable):",
    (Number(userBalance) / 1e6).toFixed(6),
    "USDC",
  );

  if (userBalance < currentDebt) {
    console.warn("⚠️  WARNING: User balance is less than debt!");
    console.warn("   Balance:", userBalance.toString());
    console.warn("   Debt:   ", currentDebt.toString());
    console.warn("   Missing:", (currentDebt - userBalance).toString());
  }

  console.groupEnd(); // Phase 1

  // === PHASE 2: Transaction Parameters ===
  console.group("📦 Phase 2: Transaction Parameters");
  console.log("Contract:", controllerAddress);
  console.log("Position ID:", positionId);
  console.log("Reserve ID:", debtReserveId.toString());
  console.log("Proxy Contract:", proxyContract);
  console.log("Token Address:", tokenAddress);
  console.log("Function Selector:", "repayToCorePosition = 0xfee7d461");
  console.log("Amount Parameter:", "maxUint256 (type(uint256).max)");
  console.log("Expected Behavior:", "Contract will fetch exact debt on-chain");
  console.groupEnd(); // Phase 2

  // === PHASE 3: Approval ===
  console.group("✅ Phase 3: Token Approval");

  // Estimate the amount needed for approval (current debt + buffer)
  // We approve a bit more than current debt to account for interest accrual
  const approvalAmount = currentDebt + currentDebt / FULL_REPAY_BUFFER_BPS;

  console.log("Approval amount (wei):", approvalAmount.toString());
  console.log(
    "Approval amount (readable):",
    (Number(approvalAmount) / 1e6).toFixed(6),
    "USDC",
  );
  console.log("Buffer added:", (approvalAmount - currentDebt).toString(), "wei");

  // Check existing allowance and approve if needed
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    userAddress,
    controllerAddress,
  );

  console.log("Current allowance:", currentAllowance.toString());

  if (currentAllowance < approvalAmount) {
    console.log("⏳ Approving tokens...");
    await ERC20.approveERC20(
      walletClient,
      chain,
      tokenAddress,
      controllerAddress,
      approvalAmount,
    );
    console.log("✓ Approval successful");
  } else {
    console.log("✓ Sufficient allowance already exists");
  }

  console.groupEnd(); // Phase 3

  console.log("🚀 Executing repay with maxUint256...");
  console.groupEnd(); // Main group

  // Pass max uint256 to trigger the contract's full repayment logic
  try {
    const result = await repay(
      walletClient,
      chain,
      controllerAddress,
      positionId,
      debtReserveId,
      maxUint256,
    );

    console.group("✅ [REPAY SUCCESS]");
    console.log("Transaction Hash:", result.transactionHash);
    console.log("Block Number:", result.receipt.blockNumber);
    console.log("Gas Used:", result.receipt.gasUsed.toString());
    console.groupEnd();

    return result;
  } catch (error) {
    console.group("❌ [REPAY FAILED]");
    console.error("Raw error object:", error);
    if (error && typeof error === "object") {
      console.error("Error name:", (error as Error).name);
      console.error("Error message:", (error as Error).message);
      if ("cause" in error) {
        console.error("Error cause:", error.cause);
      }
      if ("data" in error) {
        console.error("Error data:", error.data);
      }
      if ("shortMessage" in error) {
        console.error("Short message:", (error as any).shortMessage);
      }
    }
    console.groupEnd();
    throw error;
  }
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
