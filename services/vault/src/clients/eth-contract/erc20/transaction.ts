/**
 * ERC20 Token - Write operations (transactions)
 */

import { type Address, type Chain, type WalletClient } from "viem";

import { logger } from "@/infrastructure";

import {
  classifyError,
  ErrorCode,
  isSimulationPhaseError,
} from "../../../utils/errors";
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
 * Attempts the target approval directly, falling back to reset-to-zero +
 * approve only when the failure is consistent with the USDT zero-first quirk
 * (a non-zero approve over a non-zero allowance reverts): the revert must be
 * raised at pre-flight simulation (nothing signed, no gas burned) and the
 * current allowance must be non-zero. Standard tokens get a single prompt and
 * never see the reset (which wallets label "revoke approval"); every other
 * failure — user rejection, network error, mined revert, zero-allowance
 * revert — surfaces unchanged.
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
    // Only a pre-broadcast simulation revert can indicate the zero-first
    // quirk; a mined revert already cost gas and must surface as-is, and
    // non-revert failures (network, timeout) are not token quirks.
    if (
      !isSimulationPhaseError(error) ||
      error.code !== ErrorCode.CONTRACT_REVERT
    ) {
      throw error;
    }
    // The quirk only exists for non-zero → non-zero approvals: with a zero
    // allowance the revert has some other cause — surface the original error
    // instead of firing a pointless reset prompt. Failure-path-only read; if
    // the read itself fails the condition is unproven, so the original revert
    // (not the read error) surfaces.
    const ownerAddress = walletClient.account?.address;
    if (!ownerAddress) throw error;
    const currentAllowance = await getERC20Allowance(
      tokenAddress,
      ownerAddress,
      spenderAddress,
    ).catch(() => null);
    if (currentAllowance === null || currentAllowance === 0n) throw error;
    logger.warn("Direct ERC20 approve reverted; using zero-first fallback", {
      data: { tokenAddress },
    });
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
