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

import { COPY } from "@/copy";

import { ERC20 } from "../../../clients/eth-contract";
import { AaveAdapterTx, AaveProxy } from "../clients";
import { getAaveAdapterAddress } from "../config";
import { FULL_REPAY_BUFFER_DIVISOR } from "../constants";

import {
  approveAndVerify,
  ensureAllowance,
  formatTokenAmount,
  type TokenDisplay,
} from "./ensureAllowance";
import { repayWithStaleSimulationRetry } from "./repayStaleSimulationRetry";

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
  token: TokenDisplay,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const adapterAddress = getAaveAdapterAddress();

  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  if (userBalance < amount) {
    throw new Error(
      COPY.loans.repay.balanceBelowRepayAmount(
        formatTokenAmount(amount, token),
        formatTokenAmount(userBalance, token),
      ),
    );
  }

  const { approveSent } = await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    amount,
    token,
  );

  return repayWithStaleSimulationRetry({
    execute: () =>
      repay(walletClient, chain, userAddress, debtReserveId, amount),
    approveSent,
    forceApprove: () =>
      approveAndVerify(
        walletClient,
        chain,
        tokenAddress,
        userAddress,
        adapterAddress,
        amount,
        token,
      ),
  });
}

/**
 * Clear the FULL debt for a reserve via the adapter's repay-all sentinel.
 *
 * Quotes the position's fee-inclusive total debt from its proxy (the Spoke
 * quote excludes the adapter's interest fee), approves
 * `min(quote + buffer, balanceRaw)`, and sends `maxUint256`: the adapter
 * re-resolves the fee-inclusive debt inside the repay tx and pulls exactly
 * that, hitting the contract's exact full-repay branch — every debt share is
 * burned, so no rounding dust can survive. The proxy quote is a hard
 * dependency: a failed read blocks with a retryable error rather than
 * degrading to a fee-blind amount.
 *
 * Approval semantics (all consciously accepted):
 * - Success leaves `cap − pulled` allowance standing (≈ the buffer for funded
 *   users); a failure after approval leaves the whole cap. The spender is the
 *   env-pinned adapter, and the adapter derives the position from `borrower`
 *   on-chain, so an allowance can only ever clear the user's own debt.
 * - A standing allowance from a prior session short-circuits the approve, so
 *   the pull is bounded by that OLD allowance with no popup this session (and
 *   an unlimited standing allowance survives undecremented per ERC-20).
 * - forceApprove re-asserts the same cap (no re-quote): it only fires on the
 *   stale-HIGH-allowance-read path, where re-assertion is the fix.
 *
 * @param balanceRaw - User's exact raw token balance (caps the approval)
 */
export async function repayAll(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  proxyContract: Address,
  balanceRaw: bigint,
  token: TokenDisplay,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const quote = await AaveProxy.getPositionReserveTotalDebt(
    proxyContract,
    debtReserveId,
  );
  if (quote === 0n) {
    throw new Error("No debt to repay");
  }
  // Pre-throw instead of letting the sentinel hit ERC20InsufficientAllowance
  // on-chain: that revert is the stale-simulation retry's trigger, so an
  // underfunded repay would burn the retry budget before erroring. The quote
  // is fee-inclusive, so this can fire while the DISPLAYED debt looks covered
  // — the copy names the real requirement.
  if (balanceRaw < quote) {
    throw new Error(
      COPY.loans.repay.balanceBelowFullRepay(
        formatTokenAmount(quote, token),
        formatTokenAmount(balanceRaw, token),
      ),
    );
  }

  // Ceiling division guarantees ≥ 1 base unit of buffer even for dust-scale
  // debts where the percentage math would floor to 0.
  const bufferDelta =
    (quote + FULL_REPAY_BUFFER_DIVISOR - 1n) / FULL_REPAY_BUFFER_DIVISOR;
  const buffered = quote + bufferDelta;
  const cap = buffered < balanceRaw ? buffered : balanceRaw;

  const adapterAddress = getAaveAdapterAddress();

  const { approveSent } = await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    cap,
    token,
  );

  return repayWithStaleSimulationRetry({
    execute: () =>
      repay(walletClient, chain, userAddress, debtReserveId, maxUint256),
    approveSent,
    forceApprove: () =>
      approveAndVerify(
        walletClient,
        chain,
        tokenAddress,
        userAddress,
        adapterAddress,
        cap,
        token,
      ),
  });
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
