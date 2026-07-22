/**
 * ERC20 Token - Write operations (transactions)
 */

import { type Address, type Chain, type WalletClient } from "viem";

import { classifyError, ContractError, ErrorCode } from "../../../utils/errors";
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
 * Approve ERC20 token spending.
 *
 * Attempts the target approval directly. USDT-like tokens revert when approve
 * is called with a non-zero amount while the current allowance is also
 * non-zero; `executeWrite` pre-simulates, so that revert surfaces before any
 * wallet prompt, and only then do we fall back to reset-to-zero + approve.
 * Standard tokens get a single prompt and never see the reset (which wallets
 * label "revoke approval").
 */
export async function approveERC20(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
): Promise<TransactionResult> {
  const approveArgs = {
    walletClient,
    chain,
    address: tokenAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve" as const,
    errorContext: "approve ERC20",
  };

  try {
    return await executeWrite({
      ...approveArgs,
      args: [spenderAddress, amount],
    });
  } catch (error) {
    // A user rejection is final — never follow it with more prompts.
    if (classifyError(error) === "user-rejection") {
      throw error;
    }
    // Only a revert suggests the zero-first requirement. Anything else
    // (network failure, timeout, chain guard) is not a token quirk — rethrow
    // rather than firing a surprise reset approval.
    if (
      !(error instanceof ContractError) ||
      error.code !== ErrorCode.CONTRACT_REVERT
    ) {
      throw error;
    }
  }

  await executeWrite({
    ...approveArgs,
    args: [spenderAddress, 0n],
    errorContext: "reset ERC20 approval to zero",
  });

  return executeWrite({
    ...approveArgs,
    args: [spenderAddress, amount],
  });
}
