// ERC20 Token - Read operations (queries)

import { type Address } from 'viem';
import { ethClient } from '../client';

/**
 * Standard ERC20 ABI for read functions
 */
const ERC20_READ_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Get ERC20 token balance for an address
 * @param tokenAddress - ERC20 token contract address
 * @param holderAddress - Address to check balance for
 * @returns Balance in token's smallest unit
 */
export async function getERC20Balance(
  tokenAddress: Address,
  holderAddress: Address
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_READ_ABI,
      functionName: 'balanceOf',
      args: [holderAddress],
    });

    return balance as bigint;
  } catch (error) {
    throw new Error(
      `Failed to get ERC20 balance: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get ERC20 token allowance for a spender
 * @param tokenAddress - ERC20 token contract address
 * @param spenderAddress - Address that can spend tokens
 * @returns Allowance in token's smallest unit
 */
export async function getERC20Allowance(
  tokenAddress: Address,
  spenderAddress: Address
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  // Get the current user's address from wagmi
  const { getSharedWagmiConfig } = await import('@babylonlabs-io/wallet-connector');
  const { getAccount } = await import('@wagmi/core');
  const wagmiConfig = getSharedWagmiConfig();
  const account = getAccount(wagmiConfig);

  if (!account.address) {
    throw new Error('No connected wallet');
  }

  try {
    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_READ_ABI,
      functionName: 'allowance',
      args: [account.address, spenderAddress],
    });

    return allowance as bigint;
  } catch (error) {
    throw new Error(
      `Failed to get ERC20 allowance: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
