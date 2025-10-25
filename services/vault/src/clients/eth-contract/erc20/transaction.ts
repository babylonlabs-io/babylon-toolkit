// ERC20 Token - Write operations (transactions)

import {
  type Address,
  type Chain,
  type Hash,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { ethClient } from "../client";

/**
 * Standard ERC20 ABI for approve function
 */
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

/**
 * Approve ERC20 token spending
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param tokenAddress - ERC20 token contract address
 * @param spenderAddress - Address that will be allowed to spend tokens
 * @param amount - Amount to approve (in token's smallest unit)
 * @returns Transaction hash and receipt
 */
export async function approveERC20(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [spenderAddress, amount],
      chain,
      account: walletClient.account!,
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
      `Failed to approve ERC20: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
