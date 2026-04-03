/**
 * ERC20 Token - Write operations (transactions)
 */

import { type Address, type Chain, type WalletClient } from "viem";

import { executeWrite, type TransactionResult } from "../transactionFactory";

import { getERC20Allowance } from "./query";

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
 * Approve ERC20 token spending.
 *
 * USDT-like tokens revert if approve is called with a non-zero amount when the
 * current allowance is also non-zero. This function resets the allowance to zero
 * first when necessary, making it safe for all ERC-20 tokens.
 */
export async function approveERC20(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
): Promise<TransactionResult> {
  const ownerAddress = walletClient.account?.address;
  if (!ownerAddress) {
    throw new Error("Wallet account not available for ERC20 approval");
  }

  const currentAllowance = await getERC20Allowance(
    tokenAddress,
    ownerAddress,
    spenderAddress,
  );

  // USDT-like tokens revert if approve is called with a non-zero amount
  // when the current allowance is also non-zero. Reset to zero first.
  if (currentAllowance !== 0n) {
    await executeWrite({
      walletClient,
      chain,
      address: tokenAddress,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [spenderAddress, 0n],
      errorContext: "reset ERC20 approval to zero",
    });
  }

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
