/**
 * Position Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations for positions (borrowing, repaying, adding collateral).
 */

import type { Address, Hex, Hash, TransactionReceipt } from 'viem';
import { VaultControllerTx, VaultController, Morpho, ERC20 } from '../../clients/eth-contract';
import type { MarketParams } from '../../clients/eth-contract';
import { CONTRACTS } from '../../config/contracts';

/**
 * Result of adding collateral to position (with optional borrowing)
 */
export interface AddCollateralResult {
  /** Transaction hash */
  transactionHash: Hash;
  /** Transaction receipt */
  receipt: TransactionReceipt;
  /** Market parameters used */
  marketParams: MarketParams;
  /** Position ID (only available when not borrowing) */
  positionId?: Hex;
}

/**
 * Add collateral to position (with optional borrowing)
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHashes - Array of pegin transaction hashes (vault IDs) to use as collateral
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes)
 * @param marketId - Morpho market ID
 * @param borrowAmount - Optional amount to borrow (in loan token units). If provided and > 0, borrows from position.
 * @returns Transaction result with market parameters and optional position ID
 */
export async function addCollateralWithMarketId(
  vaultControllerAddress: Address,
  pegInTxHashes: Hex[],
  depositorBtcPubkey: Hex,
  marketId: string | bigint,
  borrowAmount?: bigint,
): Promise<AddCollateralResult> {
  // Step 1: Fetch market parameters from Morpho contract
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Step 2: Execute transaction based on whether borrowing is requested
  if (borrowAmount !== undefined && borrowAmount > 0n) {
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
  } else {
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
}

/**
 * Approve loan token spending for repayment
 *
 * Approves the required contract to spend loan tokens on behalf of the user.
 * Uses max uint256 to ensure sufficient allowance for full debt repayment.
 *
 * @param marketId - Market ID
 * @returns Transaction hash and receipt from approval
 */
export async function approveLoanTokenForRepay(
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  // Fetch loan token address from Morpho market params
  const marketParams = await Morpho.getBasicMarketParams(marketId);
  const loanTokenAddress = marketParams.loanToken;

  // Approve Morpho contract to spend loan tokens
  // Using max uint256 for unlimited approval
  const approvalAmount = 2n ** 256n - 1n;

  return ERC20.approveERC20(
    loanTokenAddress,
    CONTRACTS.MORPHO, // Approve Morpho, not the vault controller
    approvalAmount
  );
}

/**
 * Repay all debt from position
 * 
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param positionId - Position ID
 * @param marketId - Market ID
 * @returns Transaction hash and receipt
 */
export async function repayDebt(
  vaultControllerAddress: Address,
  positionId: string,
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  // Fetch market parameters
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Fetch position data which includes the proxy contract address
  const positions = await VaultController.getPositionsBulk(vaultControllerAddress, [positionId as Hex]);

  if (positions.length === 0) {
    throw new Error('Position not found');
  }

  const proxyContract = positions[0].proxyContract;

  // Fetch the LATEST debt amount from Morpho right before repaying
  // This minimizes the dust left due to interest accrual
  const position = await Morpho.getUserPosition(marketId, proxyContract);

  // Check if there's actually any debt to repay
  if (position.borrowShares === 0n) {
    throw new Error('No debt to repay - position already fully paid');
  }

  const borrowAssets = position.borrowAssets;

  console.log('[repayDebt] Repaying debt via VaultController:', {
    proxyContract,
    borrowAssets: borrowAssets.toString(),
  });

  // Repay through VaultController which handles transferring tokens to proxy
  // and calling Morpho's repay function
  const result = await VaultControllerTx.repayFromPosition(
    vaultControllerAddress,
    marketParams,
    borrowAssets,
  );

  console.log('[repayDebt] Repayment successful:', {
    transactionHash: result.transactionHash,
  });

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Withdraw ALL collateral from position (without redeeming BTC vault)
 *
 * Withdraws ALL collateral from the position but does NOT redeem the BTC vault.
 * This is different from withdrawCollateralAndRedeemBTCVault which also initiates BTC redemption.
 *
 * IMPORTANT:
 * - Withdraws ALL collateral (no partial withdrawal available)
 * - The position must have NO DEBT or this will revert
 * - Does NOT emit VaultRedeemable event (vault remains locked on Bitcoin network)
 * - Use this when you want to remove collateral without redeeming to Bitcoin network
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param marketId - Morpho market ID
 * @returns Transaction hash, receipt, and amount of collateral withdrawn
 */
export async function withdrawCollateralFromPosition(
  vaultControllerAddress: Address,
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt; }> {
  // Fetch market parameters from Morpho contract
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  return VaultControllerTx.withdrawCollateralFromPosition(
    vaultControllerAddress,
    marketParams
  );
}
