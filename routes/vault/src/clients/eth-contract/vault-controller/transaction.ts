// BTC Vault Controller - Write operations (transactions)

import { type Address, type Hash, type TransactionReceipt, type Hex } from 'viem';
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
 * @param vaultProvider - Vault provider address
 * @returns Transaction hash, receipt, and pegin transaction hash
 */
export async function submitPeginRequest(
  contractAddress: Address,
  unsignedPegInTx: Hex,
  vaultProvider: Address
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt; pegInTxHash: Hex }> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Get wallet client from wagmi (viem-compatible)
    const chain = getETHChain();

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, { chainId: chain.id });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'submitPeginRequest',
      args: [unsignedPegInTx, vaultProvider],
      chain,
    });

    console.log(`Pegin request submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    // Extract pegInTxHash from events (you may need to parse the logs)
    // For now, returning a placeholder - you'll need to extract this from the event
    const pegInTxHash = '0x' as Hex; // TODO: Extract from PegInPending event

    return {
      transactionHash: hash,
      receipt,
      pegInTxHash,
    };
  } catch (error) {
    throw new Error(
      `Failed to submit pegin request: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create a vault by minting vBTC and borrowing against it
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash (also serves as vault ID)
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes)
 * @param marketParams - Morpho market parameters
 * @param borrowAmount - Amount to borrow (in loan token units)
 * @returns Transaction hash and receipt
 */
export async function mintAndBorrow(
  contractAddress: Address,
  pegInTxHash: Hex,
  depositorBtcPubkey: Hex,
  marketParams: MarketParams,
  borrowAmount: bigint
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Get wallet client from wagmi (viem-compatible)
    const chain = getETHChain();

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, { chainId: chain.id });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'mintAndBorrow',
      args: [pegInTxHash, depositorBtcPubkey, marketParams, borrowAmount],
      chain,
    });

    console.log(`Vault creation (mintAndBorrow) submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to mint and borrow: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Repay a vault and initiate pegout
 *
 * IMPORTANT: This performs a FULL repayment only - no partial repayments.
 * The smart contract uses the user's borrowShares to repay the entire debt,
 * which ensures exact repayment without leaving dust amounts.
 *
 * NOTE: User must approve loan token spending for the exact debt amount before calling this.
 * Use borrowAssets from AccrualPosition.fetch() to get the current total debt (principal + interest).
 *
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash (also serves as vault ID)
 * @returns Transaction hash and receipt
 */
export async function repayAndPegout(
  contractAddress: Address,
  pegInTxHash: Hex
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Get wallet client from wagmi (viem-compatible)
    const chain = getETHChain();

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, { chainId: chain.id });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'repayAndPegout',
      args: [pegInTxHash],
      chain,
    });

    console.log(`Repay and pegout submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to repay and pegout: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
