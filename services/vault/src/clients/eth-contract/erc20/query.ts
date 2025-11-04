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
