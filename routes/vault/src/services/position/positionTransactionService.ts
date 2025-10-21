/**
 * Position Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations for positions (borrowing, repaying, adding collateral).
 */

import type { Address, Hex, Hash, TransactionReceipt } from 'viem';
import { VaultControllerTx, Morpho, ERC20 } from '../../clients/eth-contract';
import type { MarketParams } from '../../clients/eth-contract';

/**
 * Result of adding collateral to position
 */
export interface AddCollateralResult {
  /** Transaction hash */
  transactionHash: Hash;
  /** Transaction receipt */
  receipt: TransactionReceipt;
  /** Market parameters used */
  marketParams: MarketParams;
  /** Position ID */
  positionId: Hex;
}

/**
 * Result of adding collateral to position and borrowing
 */
export interface AddCollateralAndBorrowResult {
  /** Transaction hash */
  transactionHash: Hash;
  /** Transaction receipt */
  receipt: TransactionReceipt;
  /** Market parameters used */
  marketParams: MarketParams;
}

/**
 * Add collateral to position (without borrowing)
 *
 * This composite operation:
 * 1. Fetches Morpho market parameters by market ID
 * 2. Executes addCollateralToPosition transaction with multiple vault IDs
 * 3. Creates a new position if one doesn't exist, or adds to existing position
 *
 * Supports multi-vault collateral:
 * - Use multiple vault IDs to combine collateral from several deposits
 * - All vaults must belong to the same depositor
 * - First call creates the position, subsequent calls expand it
 * - No borrowing occurs
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHashes - Array of pegin transaction hashes (vault IDs) to use as collateral
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes)
 * @param marketId - Morpho market ID
 * @returns Transaction result with market parameters and position ID
 */
export async function addCollateralWithMarketId(
  vaultControllerAddress: Address,
  pegInTxHashes: Hex[],
  depositorBtcPubkey: Hex,
  marketId: string | bigint,
): Promise<AddCollateralResult> {
  // Step 1: Fetch market parameters from Morpho contract
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Step 2: Execute transaction with multiple vault IDs
  const { transactionHash, receipt, positionId } = await VaultControllerTx.addCollateralToPosition(
    vaultControllerAddress,
    pegInTxHashes,
    depositorBtcPubkey,
    marketParams,
  );

  return {
    transactionHash,
    receipt,
    marketParams,
    positionId,
  };
}

/**
 * Add collateral to position and borrow (creates position if needed)
 *
 * This composite operation:
 * 1. Fetches Morpho market parameters by market ID
 * 2. Executes addCollateralToPositionAndBorrow transaction with multiple vault IDs
 * 3. Creates a new position if one doesn't exist, or adds to existing position
 *
 * Supports multi-vault collateral:
 * - Use multiple vault IDs to combine collateral from several deposits
 * - All vaults must belong to the same depositor
 * - First call creates the position, subsequent calls expand it
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHashes - Array of pegin transaction hashes (vault IDs) to use as collateral
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes)
 * @param marketId - Morpho market ID
 * @param borrowAmount - Amount to borrow (in loan token units)
 * @returns Transaction result with market parameters
 */
export async function addCollateralAndBorrowWithMarketId(
  vaultControllerAddress: Address,
  pegInTxHashes: Hex[],
  depositorBtcPubkey: Hex,
  marketId: string | bigint,
  borrowAmount: bigint,
): Promise<AddCollateralAndBorrowResult> {
  // Step 1: Fetch market parameters from Morpho contract
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Step 3: Execute transaction with multiple vault IDs
  const { transactionHash, receipt } = await VaultControllerTx.addCollateralToPositionAndBorrow(
    vaultControllerAddress,
    pegInTxHashes,
    depositorBtcPubkey,
    marketParams,
    borrowAmount,
  );

  return {
    transactionHash,
    receipt,
    marketParams,
  };
}

/**
 * Approve loan token spending for vault repayment
 *
 * Fetches the loan token address from Morpho market and approves spending
 * with a 0.1% buffer to account for interest accrual.
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param repayAmountWei - Amount to repay (in loan token's smallest unit)
 * @param marketId - Morpho market ID
 * @returns Transaction hash and receipt from approval
 */
export async function approveLoanTokenForRepay(
  vaultControllerAddress: Address,
  repayAmountWei: bigint,
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  // Step 1: Fetch loan token address from Morpho market params
  const marketParams = await Morpho.getBasicMarketParams(marketId);
  const loanTokenAddress = marketParams.loanToken;

  // Step 2: Approve loan token spending
  // Add small 0.1% buffer to account for interest accrual between approval and repay execution
  // This prevents the transaction from failing if interest accrues during the process
  const approvalAmount = (repayAmountWei * 1001n) / 1000n;

  return ERC20.approveERC20(
    loanTokenAddress,
    vaultControllerAddress,
    approvalAmount
  );
}

/**
 * Withdraw collateral and redeem BTC vault
 *
 * Combined operation that:
 * 1. Repays debt (if repayAmount > 0)
 * 2. Withdraws all collateral from the position
 * 3. Initiates BTC redemption by emitting VaultRedeemable event
 *
 * IMPORTANT: This withdraws ALL collateral from the position.
 * After repayment, the position must have no remaining debt.
 *
 * Before calling:
 * - User must have approved loan token spending (call approveLoanTokenForRepay first)
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param marketParams - Morpho market parameters identifying the position
 * @param repayAmount - Amount to repay (in loan token units)
 * @returns Transaction hash and receipt
 */
export async function withdrawCollateralAndRedeemBTCVault(
  vaultControllerAddress: Address,
  marketParams: MarketParams,
  repayAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  return VaultControllerTx.withdrawCollateralAndRedeemBTCVault(
    vaultControllerAddress,
    marketParams,
    repayAmount
  );
}
