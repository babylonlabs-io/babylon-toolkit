// BTC Vault Controller - Write operations (transactions)

import {
  type Address,
  type Hash,
  type TransactionReceipt,
  type Hex,
} from 'viem';
import { getWalletClient, switchChain } from '@wagmi/core';
import { getSharedWagmiConfig } from '@babylonlabs-io/wallet-connector';
import { getETHChain } from '@babylonlabs-io/config';
import { ethClient } from '../client';
import BTCVaultControllerABI from './abis/BTCVaultController.abi.json';

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
 * Submit a pegin request
 * @param contractAddress - BTCVaultController contract address
 * @param unsignedPegInTx - Unsigned Bitcoin peg-in transaction
 * @param depositorBtcPubKey - Depositor's BTC public key (x-only, 32 bytes hex)
 * @param vaultProvider - Vault provider address
 * @returns Transaction hash and receipt
 */
export async function submitPeginRequest(
  contractAddress: Address,
  unsignedPegInTx: Hex,
  depositorBtcPubKey: Hex,
  vaultProvider: Address,
): Promise<{
  transactionHash: Hash;
  receipt: TransactionReceipt;
}> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Get wallet client from wagmi (viem-compatible)
    const chain = getETHChain();

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, {
      chainId: chain.id,
    });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'submitPeginRequest',
      args: [unsignedPegInTx, depositorBtcPubKey, vaultProvider],
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to submit pegin request: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Add collateral and borrow (or increase borrow) on existing position
 *
 * This function supports multi-vault collateral:
 * - Use multiple vault IDs to combine collateral from several deposits
 * - All vaults must belong to the same depositor
 * - First call creates the position, subsequent calls add to it
 *
 * @param contractAddress - BTCVaultController contract address
 * @param vaultIds - Array of vault IDs (pegin transaction hashes) to use as collateral
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes)
 * @param marketParams - Morpho market parameters
 * @param borrowAmount - Amount to borrow (in loan token units)
 * @returns Transaction hash and receipt
 */
export async function addCollateralToPositionAndBorrow(
  contractAddress: Address,
  vaultIds: Hex[],
  depositorBtcPubkey: Hex,
  marketParams: MarketParams,
  borrowAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Get wallet client from wagmi (viem-compatible)
    const chain = getETHChain();

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, {
      chainId: chain.id,
    });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'addCollateralToPositionAndBorrow',
      args: [vaultIds, depositorBtcPubkey, marketParams, borrowAmount],
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to add collateral and borrow: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
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
 * NOTE: User must approve loan token spending for the repay amount before calling this.
 * Use borrowAssets from AccrualPosition.fetch() to get the current total debt (principal + interest).
 *
 * @param contractAddress - BTCVaultController contract address
 * @param marketParams - Morpho market parameters identifying the position
 * @param repayAmount - Amount to repay (in loan token units, 0 if no debt)
 * @returns Transaction hash and receipt
 */
export async function withdrawCollateralAndRedeemBTCVault(
  contractAddress: Address,
  marketParams: MarketParams,
  repayAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Get wallet client from wagmi (viem-compatible)
    const chain = getETHChain();

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, {
      chainId: chain.id,
    });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'withdrawCollateralAndRedeemBTCVault',
      args: [marketParams, repayAmount],
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to withdraw collateral and redeem BTC vault: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
