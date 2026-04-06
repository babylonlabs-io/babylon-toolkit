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
 * Get ERC20 token decimals from the contract on-chain.
 *
 * Reads directly from the token contract rather than trusting an external
 * source (e.g. a GraphQL indexer) for this value. Using the wrong decimals
 * in parseUnits would silently produce a different amount than the user
 * intended, so this must be authoritative.
 *
 * @param tokenAddress - ERC20 token contract address
 * @returns Token decimals (e.g. 6 for USDC, 18 for WETH)
 */
export async function getERC20Decimals(tokenAddress: Address): Promise<number> {
  const publicClient = ethClient.getPublicClient();

  const decimals = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    args: [],
  });

  const MAX_REASONABLE_DECIMALS = 18;
  if (decimals > MAX_REASONABLE_DECIMALS) {
    throw new Error(
      `Token ${tokenAddress} reported ${decimals} decimals, expected at most ${MAX_REASONABLE_DECIMALS}`,
    );
  }

  return decimals as number;
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
