// ERC20 Token - Read operations (queries)

import type { Abi, Address } from 'viem';
import { ethClient } from '../client';
import erc20Abi from './abis/erc20-abi.json';
import type { TokenMetadata } from './types';

/**
 * Get ERC20 token metadata (name, symbol, decimals)
 * @param tokenAddress - ERC20 token contract address
 * @returns Token metadata
 */
export async function getMetadata(tokenAddress: Address): Promise<TokenMetadata> {
  const publicClient = ethClient.getPublicClient();

  const [name, symbol, decimals] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi as Abi,
      functionName: 'name',
      args: [],
    }) as Promise<string>,
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi as Abi,
      functionName: 'symbol',
      args: [],
    }) as Promise<string>,
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi as Abi,
      functionName: 'decimals',
      args: [],
    }) as Promise<number>,
  ]);

  return { address: tokenAddress, name, symbol, decimals };
}
