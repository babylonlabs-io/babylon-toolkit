// ERC20 - Read operations (queries)

import type { Address } from "viem";

import { ethClient } from "../client";

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
 * Get ERC20 token symbol
 * @param tokenAddress - ERC20 token contract address
 * @returns Token symbol (e.g., "USDC", "WETH")
 */
export async function getERC20Symbol(tokenAddress: Address): Promise<string> {
  const publicClient = ethClient.getPublicClient();

  const symbol = await publicClient.readContract({
    address: tokenAddress,
    abi: [
      {
        name: "symbol",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
      },
    ],
    functionName: "symbol",
  });

  return symbol as string;
}

/**
 * Get ERC20 token name
 * @param tokenAddress - ERC20 token contract address
 * @returns Token name (e.g., "USD Coin", "Wrapped Ether")
 */
export async function getERC20Name(tokenAddress: Address): Promise<string> {
  const publicClient = ethClient.getPublicClient();

  const name = await publicClient.readContract({
    address: tokenAddress,
    abi: [
      {
        name: "name",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
      },
    ],
    functionName: "name",
  });

  return name as string;
}

/**
 * Get ERC20 token decimals
 * @param tokenAddress - ERC20 token contract address
 * @returns Token decimals (e.g., 18, 6)
 */
export async function getERC20Decimals(tokenAddress: Address): Promise<number> {
  const publicClient = ethClient.getPublicClient();

  const decimals = await publicClient.readContract({
    address: tokenAddress,
    abi: [
      {
        name: "decimals",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
      },
    ],
    functionName: "decimals",
  });

  return decimals as number;
}
