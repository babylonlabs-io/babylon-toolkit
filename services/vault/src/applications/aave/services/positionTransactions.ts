/**
 * Aave Position Transactions Service
 *
 * Orchestrates transaction operations for Aave positions.
 * Handles borrow, repay, withdraw, and reorder operations.
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
import { AaveAdapterTx, AaveSpoke } from "../clients";
import { getAaveAdapterAddress } from "../config";
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
 * Approve if needed, then verify the approval landed on-chain.
 *
 * We've seen the subsequent repay tx revert with `ERC20InsufficientAllowance`
 * after the approve receipt returned cleanly — the public RPC can briefly
 * serve pre-block state, so the next tx executes against a stale allowance.
 * Re-reading turns a revert-after-signing into a pre-broadcast error.
 */
async function ensureAllowance(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
  requiredAmount: bigint,
): Promise<void> {
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    ownerAddress,
    spenderAddress,
  );
  if (currentAllowance >= requiredAmount) return;

  await ERC20.approveERC20(
    walletClient,
    chain,
    tokenAddress,
    spenderAddress,
    requiredAmount,
  );

  const verifiedAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    ownerAddress,
    spenderAddress,
  );
  if (verifiedAllowance < requiredAmount) {
    throw new Error(
      `Approval did not take effect on-chain (expected at least ${requiredAmount}, got ${verifiedAllowance}). This is usually a transient RPC lag — please refresh the page and try again.`,
    );
  }
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

  await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    amount,
  );

  return repay(walletClient, chain, userAddress, debtReserveId, amount);
}

/**
 * Clear the full debt for the `debt ≤ balance < debt × (1 + buffer)` case
 * (`pickRepayParams` only routes here when `balance ≥ debt`). Sends `maxUint256`
 * (Aave's repay-all sentinel) so the adapter clears the current debt incl.
 * interest accrued before broadcast, but caps the approval at `balanceAmount` —
 * if accrual pushes debt past the balance the tx reverts cleanly, not silent dust.
 *
 * @param balanceAmount - User's full balance; approved as the cap (amount sent is `maxUint256`)
 */
export async function repayMaxCapped(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  balanceAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  if (balanceAmount <= 0n) {
    throw new Error("Repay amount must be greater than 0");
  }

  const adapterAddress = getAaveAdapterAddress();

  await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    balanceAmount,
  );

  return repay(walletClient, chain, userAddress, debtReserveId, maxUint256);
}

/**
 * Repay all debt for a reserve
 *
 * Fetches exact debt from contract, handles approval, then repays.
 * Uses pinned adapter and spoke addresses from trusted environment config.
 *
 * Approval/refund: the adapter pulls the full `currentDebt × (1 + buffer)`,
 * routes the actual debt, and refunds the unused buffer in the same tx.
 * Residual allowance after the tx = 0; no `approve(0)` cleanup needed.
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
  const spokeAddress = await AaveAdapterTx.getCoreSpokeAddress(adapterAddress);

  // Fetch current debt from the contract
  const currentDebt = await AaveSpoke.getUserTotalDebt(
    spokeAddress,
    debtReserveId,
    proxyContract,
  );

  if (currentDebt === 0n) {
    throw new Error("No debt to repay");
  }

  // Ceiling division guarantees ≥ 1 base unit of buffer even for dust-scale
  // debts where the percentage math would floor to 0.
  const bufferDelta =
    (currentDebt + FULL_REPAY_BUFFER_DIVISOR - 1n) / FULL_REPAY_BUFFER_DIVISOR;
  const amountToRepay = currentDebt + bufferDelta;

  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  if (userBalance < amountToRepay) {
    throw new Error(
      "insufficient balance to fully repay: not enough stablecoin to cover the debt plus interest",
    );
  }

  await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    amountToRepay,
  );

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

/**
 * Reorder vaults for liquidation priority
 *
 * Changes the prefix ordering of vaults on-chain. Vaults at lower indices
 * are seized first during liquidation. The permuted array must contain
 * exactly the same vault IDs as the current position, in the desired new order.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param permutedVaultIds - Vault IDs in desired new order (must be a permutation)
 * @returns Transaction result
 */
export async function reorderVaultOrder(
  walletClient: WalletClient,
  chain: Chain,
  permutedVaultIds: Hex[],
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const result = await AaveAdapterTx.reorderVaults(
    walletClient,
    chain,
    getAaveAdapterAddress(),
    permutedVaultIds,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}
