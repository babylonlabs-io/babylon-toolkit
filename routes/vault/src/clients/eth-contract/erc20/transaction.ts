// ERC20 Token - Write operations (transactions)

import { type Address, type Hash, type TransactionReceipt } from 'viem';
import { getWalletClient, switchChain } from '@wagmi/core';
import { getSharedWagmiConfig } from '@babylonlabs-io/wallet-connector';
import { getETHChain } from '@babylonlabs-io/config';
import { ethClient } from '../client';

/**
 * Standard ERC20 ABI for approve function
 */
const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * Approve ERC20 token spending
 * @param tokenAddress - ERC20 token contract address
 * @param spenderAddress - Address that will be allowed to spend tokens
 * @param amount - Amount to approve (in token's smallest unit)
 * @returns Transaction hash and receipt
 */
export async function approveERC20(
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint
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
      address: tokenAddress,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [spenderAddress, amount],
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
      `Failed to approve ERC20: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
