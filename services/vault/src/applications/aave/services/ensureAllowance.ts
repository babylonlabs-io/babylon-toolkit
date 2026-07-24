/**
 * ERC-20 allowance machinery for the Aave repay flow: approve, then verify
 * the approval from its own mined receipt rather than a fresh RPC read.
 */

import type { Address, Chain, WalletClient } from "viem";
import { formatUnits, isAddressEqual, parseEventLogs } from "viem";

import { COPY } from "@/copy";
import { abortableSleep } from "@/utils/async";

import { ERC20 } from "../../../clients/eth-contract";

/** Display metadata for the debt token, used only in error copy. */
export interface TokenDisplay {
  symbol: string;
  decimals: number;
}

/** Bounded fallback verification when the approve receipt has no usable Approval event. */
const ALLOWANCE_VERIFY_ATTEMPTS = 3;
const ALLOWANCE_VERIFY_RETRY_DELAY_MS = 2000;

/** Approval event ABI for parsing the approve receipt's logs. */
const ERC20_APPROVAL_EVENT_ABI = [
  {
    type: "event",
    name: "Approval",
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

export function formatTokenAmount(amount: bigint, token: TokenDisplay): string {
  return `${formatUnits(amount, token.decimals)} ${token.symbol}`;
}

/**
 * Send the approval and verify it from its own mined receipt's Approval event
 * — the receipt is chain truth for this tx, immune to a load-balanced RPC
 * serving pre-block state on a follow-up read. The read-based fallback covers
 * receipts without a matching event: wallet-replaced txs (cancel / speed-up
 * resolve to the replacement's receipt) and tokens that don't emit Approval.
 */
export async function approveAndVerify(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
  requiredAmount: bigint,
  token: TokenDisplay,
): Promise<void> {
  const { receipt } = await ERC20.approveERC20(
    walletClient,
    chain,
    tokenAddress,
    spenderAddress,
    requiredAmount,
  );

  const approvalLogs = parseEventLogs({
    abi: ERC20_APPROVAL_EVENT_ABI,
    logs: receipt.logs,
    eventName: "Approval",
  });
  // Last match wins: a Safe batch execution can carry sibling Approval logs.
  const matched = approvalLogs
    .filter(
      (log) =>
        isAddressEqual(log.address, tokenAddress) &&
        isAddressEqual(log.args.owner, ownerAddress) &&
        isAddressEqual(log.args.spender, spenderAddress),
    )
    .at(-1);

  if (matched) {
    if (matched.args.value >= requiredAmount) return;
    // Deterministic shortfall — e.g. the user edited the wallet's spending
    // cap below what the repay needs. No retry can fix it.
    throw new Error(
      COPY.loans.repay.approvalBelowRequired(
        formatTokenAmount(requiredAmount, token),
        formatTokenAmount(matched.args.value, token),
      ),
    );
  }

  let observed = 0n;
  for (let attempt = 0; attempt < ALLOWANCE_VERIFY_ATTEMPTS; attempt++) {
    if (attempt > 0) await abortableSleep(ALLOWANCE_VERIFY_RETRY_DELAY_MS);
    observed = await ERC20.getERC20Allowance(
      tokenAddress,
      ownerAddress,
      spenderAddress,
    );
    if (observed >= requiredAmount) return;
  }
  throw new Error(
    COPY.loans.repay.approvalNotConfirmed(
      formatTokenAmount(requiredAmount, token),
      formatTokenAmount(observed, token),
    ),
  );
}

/**
 * Ensure the adapter can pull `requiredAmount`, approving when the current
 * allowance is short. Returns whether an approve was actually sent so the
 * repay retry can force one if the short-circuit read turns out stale.
 */
export async function ensureAllowance(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
  requiredAmount: bigint,
  token: TokenDisplay,
): Promise<{ approveSent: boolean }> {
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    ownerAddress,
    spenderAddress,
  );
  if (currentAllowance >= requiredAmount) return { approveSent: false };

  await approveAndVerify(
    walletClient,
    chain,
    tokenAddress,
    ownerAddress,
    spenderAddress,
    requiredAmount,
    token,
  );
  return { approveSent: true };
}
