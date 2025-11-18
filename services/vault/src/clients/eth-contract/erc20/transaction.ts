/**
 * ERC20 Token - Write operations (transactions)
 */

import { type Address, type Chain, type WalletClient } from "viem";

import { executeWrite, type TransactionResult } from "../transactionFactory";

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
 */
export async function approveERC20(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
): Promise<TransactionResult> {
  return executeWrite({
    walletClient,
    chain,
    address: tokenAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spenderAddress, amount],
    errorContext: "approve ERC20",
  });
}
