// ERC20 - Read operations (queries)

import type { Address } from "viem";

import { ethClient } from "../client";

/**
 * Standard ERC20 ABI fragments for common read operations
 */
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

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
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [holderAddress],
  });

  return balance as bigint;
}

/**
 * Get ERC20 token allowance
 * @param tokenAddress - ERC20 token contract address
 * @param ownerAddress - Address that owns the tokens
 * @param spenderAddress - Address that is allowed to spend the tokens
 * @returns Allowance amount in token's smallest unit
 */
export async function getERC20Allowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  return allowance as bigint;
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
    abi: ERC20_ABI,
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
    abi: ERC20_ABI,
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
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  return decimals as number;
}
