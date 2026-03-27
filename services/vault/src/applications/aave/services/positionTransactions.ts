/**
 * Aave Position Transactions Service
 *
 * Orchestrates transaction operations for Aave positions.
 * Handles borrow, repay, and withdraw operations.
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
import { AaveAdapterTx, AaveSpoke } from "../clients";
import { getAaveAdapterAddress, getAaveSpokeAddress } from "../config";
import { FULL_REPAY_BUFFER_DIVISOR } from "../constants";

/**
 * Borrow from a Core Spoke position
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the asset to borrow
 * @param amount - Amount to borrow (in debt token decimals)
 * @returns Transaction result
 */
export async function borrow(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const result = await AaveAdapterTx.borrowFromCorePosition(
    walletClient,
    chain,
    getAaveAdapterAddress(),
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
 * User must have approved the adapter to spend debt tokens first.
 * Uses the pinned adapter address from trusted environment config.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param borrower - Borrower's address (for self-repay, use connected wallet address)
 * @param debtReserveId - Reserve ID for the debt token
 * @param amount - Amount to repay (in debt token decimals)
 * @returns Transaction result
 */
export async function repay(
  walletClient: WalletClient,
  chain: Chain,
  borrower: Address,
  debtReserveId: bigint,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const adapterAddress = getAaveAdapterAddress();
  if (amount <= 0n) {
    throw new Error("Repay amount must be greater than 0");
  }

  const result = await AaveAdapterTx.repayToCorePosition(
    walletClient,
    chain,
    adapterAddress,
    borrower,
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
 * Uses the pinned adapter address from trusted environment config.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the debt token
 * @param tokenAddress - Token address for the debt
 * @param amount - Amount to repay (in debt token decimals)
 * @returns Transaction result
 */
export async function repayPartial(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const adapterAddress = getAaveAdapterAddress();

  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  if (userBalance < amount) {
    throw new Error(
      "insufficient balance to repay: not enough token balance for the requested amount",
    );
  }

  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    userAddress,
    adapterAddress,
  );

  if (currentAllowance < amount) {
    await ERC20.approveERC20(
      walletClient,
      chain,
      tokenAddress,
      adapterAddress,
      amount,
    );
  }

  return repay(walletClient, chain, userAddress, debtReserveId, amount);
}

/**
 * Repay all debt for a reserve
 *
 * Fetches exact debt from contract, handles approval, then repays.
 * Uses pinned adapter and spoke addresses from trusted environment config.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the debt token
 * @param tokenAddress - Token address for the debt
 * @param proxyContract - User's proxy contract address
 * @returns Transaction result
 */
export async function repayFull(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  proxyContract: Address,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const adapterAddress = getAaveAdapterAddress();
  const spokeAddress = getAaveSpokeAddress();

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
  const amountToRepay = currentDebt + currentDebt / FULL_REPAY_BUFFER_DIVISOR;

  // Check user's token balance before proceeding
  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  if (userBalance < amountToRepay) {
    throw new Error(
      "insufficient balance to fully repay: not enough stablecoin to cover the debt plus interest",
    );
  }

  // Check existing allowance and approve if needed
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    userAddress,
    adapterAddress,
  );

  if (currentAllowance < amountToRepay) {
    await ERC20.approveERC20(
      walletClient,
      chain,
      tokenAddress,
      adapterAddress,
      amountToRepay,
    );
  }

  return repay(walletClient, chain, userAddress, debtReserveId, amountToRepay);
}

/**
 * Withdraw selected vaults from a position
 *
 * Position must have zero debt before withdrawal.
 * Withdraws only the specified vaults and redeems them back to the depositor.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param vaultIds - Array of vault IDs (bytes32 hex strings) to withdraw
 * @returns Transaction result
 */
export async function withdrawSelectedCollateral(
  walletClient: WalletClient,
  chain: Chain,
  vaultIds: Hex[],
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const result = await AaveAdapterTx.withdrawCollaterals(
    walletClient,
    chain,
    getAaveAdapterAddress(),
    vaultIds,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}
