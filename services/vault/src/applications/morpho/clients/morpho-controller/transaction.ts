/**
 * Morpho Integration Controller - Write operations (transactions)
 */

import { type Address, type Chain, type Hex, type WalletClient } from "viem";

import {
  executeWrite,
  type TransactionResult,
} from "../../../../clients/eth-contract/transactionFactory";

import MorphoIntegrationControllerABI from "./abis/MorphoIntegrationController.abi.json";

/**
 * Morpho market parameters
 */
export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

/**
 * Add collateral to position (without borrowing)
 */
export async function addCollateralToPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultIds: Hex[],
  marketParams: MarketParams,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "addCollateralToPosition",
    args: [vaultIds, marketParams],
    errorContext: "add collateral to position",
  });
}

/**
 * Add collateral and borrow in one transaction
 */
export async function addCollateralToPositionAndBorrow(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultIds: Hex[],
  marketParams: MarketParams,
  borrowAmount: bigint,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "addCollateralToPositionAndBorrow",
    args: [vaultIds, marketParams, borrowAmount],
    errorContext: "add collateral and borrow",
  });
}

/**
 * Repay debt from position
 */
export async function repayFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
  repayAmount: bigint,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "repayFromPosition",
    args: [marketParams, repayAmount],
    errorContext: "repay from position",
  });
}

/**
 * Repay debt directly to Morpho using shares
 *
 * For full repayment: set repayAmount=0 and shares=borrowShares
 * For partial repayment: set repayAmount>0 and shares=0
 */
export async function repayDirectlyToMorpho(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
  repayAmount: bigint,
  shares: bigint,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "repayDirectlyToMorpho",
    args: [marketParams, repayAmount, shares],
    errorContext: "repay directly to Morpho",
  });
}

/**
 * Borrow more from an existing position
 */
export async function borrowFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
  borrowAmount: bigint,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "borrowFromPosition",
    args: [marketParams, borrowAmount],
    errorContext: "borrow from position",
  });
}

/**
 * Withdraw ALL collateral from position
 */
export async function withdrawAllCollateralFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "withdrawAllCollateralFromPosition",
    args: [marketParams],
    errorContext: "withdraw all collateral from position",
  });
}

/**
 * Redeem BTC vault
 */
export async function redeemBTCVault(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultId: Hex,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: contractAddress,
    abi: MorphoIntegrationControllerABI,
    functionName: "redeemBTCVault",
    args: [vaultId],
    errorContext: "redeem BTC vault",
  });
}
