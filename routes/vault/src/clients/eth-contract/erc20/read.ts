import type { Abi, Address, PublicClient } from 'viem';
import { publicClient as defaultClient } from '../publicClient';
import erc20Abi from '../artifacts/erc20-abi.json';
import type { TokenMetadata } from './types';

export async function getMetadata(
  tokenAddress: Address,
  client: PublicClient = defaultClient
): Promise<TokenMetadata> {
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi as Abi,
      functionName: 'name',
      args: []
    }) as Promise<string>,
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi as Abi,
      functionName: 'symbol',
      args: []
    }) as Promise<string>,
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi as Abi,
      functionName: 'decimals',
      args: []
    }) as Promise<number>
  ]);

  return { address: tokenAddress, name, symbol, decimals };
}


