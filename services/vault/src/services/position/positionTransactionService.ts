/**
 * Position Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations for positions (borrowing, repaying, adding collateral).
 */

import {
  formatUnits,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import type { MarketParams } from "../../clients/eth-contract";
import {
  ERC20,
  Morpho,
  MorphoOracle,
  VaultController,
  VaultControllerTx,
} from "../../clients/eth-contract";
import { CONTRACTS } from "../../config/contracts";
import { ContractError } from "../../utils/errors";

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
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHashes - Array of pegin transaction hashes (vault IDs) to use as collateral
 * @param marketId - Morpho market ID
 * @param borrowAmount - Optional amount to borrow (in loan token units). If provided and > 0, borrows from position.
 * @returns Transaction result with market parameters and optional position ID
 */
export async function addCollateralWithMarketId(
  walletClient: WalletClient,
  chain: Chain,
  vaultControllerAddress: Address,
  pegInTxHashes: Hex[],
  marketId: string | bigint,
  borrowAmount?: bigint,
): Promise<AddCollateralResult> {
  // Step 1: Fetch market parameters from Morpho contract
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Step 2: Execute transaction based on whether borrowing is requested
  if (borrowAmount !== undefined && borrowAmount > 0n) {
    const { transactionHash, receipt } =
      await VaultControllerTx.addCollateralToPositionAndBorrow(
        walletClient,
        chain,
        vaultControllerAddress,
        pegInTxHashes,
        marketParams,
        borrowAmount,
      );

    return {
      transactionHash,
      receipt,
      marketParams,
    };
  } else {
    const { transactionHash, receipt, positionId } =
      await VaultControllerTx.addCollateralToPosition(
        walletClient,
        chain,
        vaultControllerAddress,
        pegInTxHashes,
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
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param marketId - Market ID
 * @returns Transaction hash and receipt from approval
 */
export async function approveLoanTokenForRepay(
  walletClient: WalletClient,
  chain: Chain,
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  // Fetch loan token address from Morpho market params
  const marketParams = await Morpho.getBasicMarketParams(marketId);
  const loanTokenAddress = marketParams.loanToken;

  // Approve VaultController to spend loan tokens (not Morpho directly)
  // VaultController.repayFromPosition does: transferFrom(msg.sender, proxy, amount)
  // Using max uint256 for unlimited approval
  const approvalAmount = 2n ** 256n - 1n;

  return ERC20.approveERC20(
    walletClient,
    chain,
    loanTokenAddress,
    CONTRACTS.VAULT_CONTROLLER, // Approve VaultController to transfer tokens
    approvalAmount,
  );
}

/**
 * Validate position has collateral and is not liquidated
 */
function validatePositionCollateral(
  collateral: bigint,
  borrowAssets: bigint,
): void {
  if (collateral === 0n && borrowAssets > 0n) {
    throw new Error(
      "Position has been liquidated. All collateral has been seized. " +
        `Remaining bad debt: ${(Number(borrowAssets) / 1e6).toFixed(6)} USDC. ` +
        "This debt cannot be repaid through normal means.",
    );
  }

  if (collateral === 0n) {
    throw new Error(
      "Position has no collateral. Cannot repay from an empty position.",
    );
  }
}

/**
 * Validate position is not underwater (LTV > liquidation threshold)
 */
function validatePositionHealth(
  collateral: bigint,
  borrowAssets: bigint,
  btcPriceUSD: number,
  liquidationLTV: number,
): void {
  const collateralBTC = Number(formatUnits(collateral, 18)); // vBTC has 18 decimals
  const collateralValueUSD = collateralBTC * btcPriceUSD;
  const debtValueUSD = Number(formatUnits(borrowAssets, 6)); // USDC has 6 decimals
  const currentLTV =
    collateralValueUSD > 0 ? debtValueUSD / collateralValueUSD : Infinity;

  if (currentLTV > liquidationLTV) {
    const ltvPercent = (currentLTV * 100).toFixed(2);
    const liqLtvPercent = (liquidationLTV * 100).toFixed(2);

    throw new Error(
      `Cannot repay: Position is underwater (LTV ${ltvPercent}% exceeds liquidation threshold ${liqLtvPercent}%). ` +
        `This position is eligible for liquidation. The contract is likely blocking repayment operations. ` +
        `Collateral: ${collateralBTC.toFixed(8)} BTC ($${collateralValueUSD.toFixed(2)}), ` +
        `Debt: ${debtValueUSD.toFixed(6)} USDC. ` +
        `To fix: Either liquidate the position or adjust the oracle price to restore a healthy LTV.`,
    );
  }
}

/**
 * Calculate repay amount with buffer for interest accrual
 */
function calculateRepayAmount(borrowAssets: bigint): bigint {
  const bufferPercent = borrowAssets / 1000n; // 0.1% of debt
  const minBuffer = 1_000_000n; // 1 USDC (6 decimals)
  const buffer = bufferPercent > minBuffer ? bufferPercent : minBuffer;
  return borrowAssets + buffer;
}

/**
 * Repay ALL debt from position (full repayment)
 *
 * This function repays the entire debt with a buffer to account for interest accrual
 * between transaction submission and execution. Use this when user clicks "Max" or
 * wants to fully close their position.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param positionId - Position ID
 * @param marketId - Market ID
 * @returns Transaction hash and receipt
 */
export async function repayDebtFull(
  walletClient: WalletClient,
  chain: Chain,
  vaultControllerAddress: Address,
  positionId: string,
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Fetch position data
  const positions = await VaultController.getPositionsBulk(
    vaultControllerAddress,
    [positionId as Hex],
  );
  if (positions.length === 0) {
    throw new Error("Position not found");
  }

  const proxyContract = positions[0].proxyContract;
  const position = await Morpho.getUserPosition(marketId, proxyContract);

  if (position.borrowShares === 0n) {
    throw new Error("No debt to repay - position already fully paid");
  }

  const { borrowAssets, collateral } = position;

  // Validate position state
  validatePositionCollateral(collateral, borrowAssets);

  // Fetch market data and validate position health
  const marketData = await Morpho.getMarketWithData(marketId);
  const oraclePrice = await MorphoOracle.getOraclePrice(
    marketData.oracle as Address,
  );
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);
  const liquidationLTV = Number(formatUnits(marketData.lltv, 18));

  validatePositionHealth(collateral, borrowAssets, btcPriceUSD, liquidationLTV);

  // Calculate repay amount with buffer
  const repayAmount = calculateRepayAmount(borrowAssets);

  // Execute repayment
  try {
    const result = await VaultControllerTx.repayFromPosition(
      walletClient,
      chain,
      vaultControllerAddress,
      marketParams,
      repayAmount,
    );

    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  } catch (error) {
    if (error instanceof ContractError) {
      throw error;
    }
    throw new ContractError(
      `Failed to repay from position: ${error instanceof Error ? error.message : "Unknown error"}. ` +
        `Required amount: ${(Number(repayAmount) / 1e6).toFixed(6)} USDC. ` +
        `Please ensure you have sufficient USDC balance and the VaultController has approval to spend your tokens.`,
      undefined,
      undefined,
      undefined,
      { cause: error },
    );
  }
}

/**
 * Repay PARTIAL debt from position (specific amount)
 *
 * This function repays an exact amount specified by the user (no buffer added).
 * Use this when user selects a specific amount via slider, not the full amount.
 *
 * Note: This does NOT add a buffer for interest accrual. The exact amount specified
 * will be repaid. User must have sufficient USDC balance for the exact amount.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param positionId - Position ID
 * @param marketId - Market ID
 * @param repayAmount - Exact amount to repay (in loan token units, e.g., USDC with 6 decimals)
 * @returns Transaction hash and receipt
 */
export async function repayDebtPartial(
  walletClient: WalletClient,
  chain: Chain,
  vaultControllerAddress: Address,
  positionId: string,
  marketId: string | bigint,
  repayAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  // Fetch position data
  const positions = await VaultController.getPositionsBulk(
    vaultControllerAddress,
    [positionId as Hex],
  );
  if (positions.length === 0) {
    throw new Error("Position not found");
  }

  const proxyContract = positions[0].proxyContract;
  const position = await Morpho.getUserPosition(marketId, proxyContract);

  if (position.borrowShares === 0n) {
    throw new Error("No debt to repay - position already fully paid");
  }

  const { borrowAssets, collateral } = position;

  // Validate repay amount
  if (repayAmount <= 0n) {
    throw new Error("Repay amount must be greater than 0");
  }

  if (repayAmount > borrowAssets) {
    throw new Error(
      `Repay amount (${Number(formatUnits(repayAmount, 6)).toFixed(6)} USDC) ` +
        `exceeds current debt (${Number(formatUnits(borrowAssets, 6)).toFixed(6)} USDC). ` +
        `Use repayDebtFull() for full repayment.`,
    );
  }

  // Validate position state
  validatePositionCollateral(collateral, borrowAssets);

  // Fetch market data and validate position health BEFORE repayment
  const marketData = await Morpho.getMarketWithData(marketId);
  const oraclePrice = await MorphoOracle.getOraclePrice(
    marketData.oracle as Address,
  );
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);
  const liquidationLTV = Number(formatUnits(marketData.lltv, 18));

  validatePositionHealth(collateral, borrowAssets, btcPriceUSD, liquidationLTV);

  // Execute partial repayment (no buffer added - exact amount)
  try {
    const result = await VaultControllerTx.repayFromPosition(
      walletClient,
      chain,
      vaultControllerAddress,
      marketParams,
      repayAmount,
    );

    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  } catch (error) {
    if (error instanceof ContractError) {
      throw error;
    }
    throw new ContractError(
      `Failed to repay from position: ${error instanceof Error ? error.message : "Unknown error"}. ` +
        `Required amount: ${Number(formatUnits(repayAmount, 6)).toFixed(6)} USDC. ` +
        `Please ensure you have sufficient USDC balance and the VaultController has approval to spend your tokens.`,
      undefined,
      undefined,
      undefined,
      { cause: error },
    );
  }
}

/**
 * Borrow more from an existing position
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param marketId - Market ID
 * @param borrowAmount - Amount to borrow (in loan token units)
 * @returns Transaction hash, receipt, and actual amount borrowed
 */
export async function borrowMoreFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  vaultControllerAddress: Address,
  marketId: string | bigint,
  borrowAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  // Fetch market parameters
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  return VaultControllerTx.borrowFromPosition(
    walletClient,
    chain,
    vaultControllerAddress,
    marketParams,
    borrowAmount,
  );
}

/**
 * Withdraw ALL collateral from position (without redeeming BTC vault)
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param marketId - Morpho market ID
 * @returns Transaction hash, receipt, and amount of collateral withdrawn
 */
export async function withdrawCollateralFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  vaultControllerAddress: Address,
  marketId: string | bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  // Fetch market parameters from Morpho contract
  const marketParams = await Morpho.getBasicMarketParams(marketId);

  return VaultControllerTx.withdrawCollateralFromPosition(
    walletClient,
    chain,
    vaultControllerAddress,
    marketParams,
  );
}
