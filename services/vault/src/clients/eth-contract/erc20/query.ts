// ERC20 - Read operations (queries)

import type { Address } from "viem";

import { ethClient } from "../client";

const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface ERC20Metadata {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Get ERC20 token balance for an address
 * @param tokenAddress - ERC20 token contract address
 * @param holderAddress - Address to check balance for
 * @returns Balance in token's smallest unit (e.g., wei for 18 decimals, smallest unit for 6 decimals)
 */
export async function getERC20Balance(
  tokenAddress: Address,
  holderAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "balance", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [holderAddress],
  });

  return balance as bigint;
}

/**
 * Fetch ERC20 token metadata from blockchain
 * @param address - Token contract address
 * @returns Token metadata (name, symbol, decimals) or null if fetch fails
 */
export async function fetchERC20Metadata(
  address: Address,
): Promise<ERC20Metadata | null> {
  try {
    const publicClient = ethClient.getPublicClient();

    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "name",
      }),
      publicClient.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals",
      }),
    ]);

    return {
      address,
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
    };
  } catch (error) {
    console.warn(`[ERC20Client] Failed to fetch metadata for ${address}:`, error);
    return null;
  }
}
