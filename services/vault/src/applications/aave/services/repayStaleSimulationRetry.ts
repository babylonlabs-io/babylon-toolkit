/**
 * Retry engine for repay transactions whose pre-flight simulation hit a
 * stale RPC backend. Only simulation-phase allowance reverts are absorbed;
 * mined reverts and every other error propagate untouched.
 */

import type { Hash, TransactionReceipt } from "viem";

import { logger } from "@/infrastructure";
import { abortableSleep } from "@/utils/async";

import { ErrorCode, isSimulationPhaseError } from "../../../utils/errors";

type RepayResult = { transactionHash: Hash; receipt: TransactionReceipt };

/** Delay before retrying a repay whose simulation hit a stale backend. */
const REPAY_STALE_SIM_RETRY_DELAY_MS = 3000;

/** Decoded reason for the OZ allowance revert (always in COMMON_ERROR_ABI). */
const ERC20_INSUFFICIENT_ALLOWANCE_REASON = "ERC20InsufficientAllowance";

/**
 * True for an ERC20InsufficientAllowance raised at pre-flight simulation:
 * nothing was signed or broadcast, so with a receipt-verified approval it can
 * only mean the simulating backend has not caught up to the approve block.
 */
function isStaleAllowanceSimulationError(err: unknown): boolean {
  return (
    isSimulationPhaseError(err) &&
    err.code === ErrorCode.CONTRACT_REVERT &&
    err.reason === ERC20_INSUFFICIENT_ALLOWANCE_REASON
  );
}

/**
 * Run the repay, absorbing stale-backend allowance reverts at simulation:
 * three attempts with catch-up delays on every path. When the approve was
 * short-circuited (a stale HIGH allowance read can skip a genuinely needed
 * approve), the second failure forces the approve before the last attempt; a
 * receipt-verified approve can't be improved on, so that path just
 * re-simulates. Mined reverts and all other errors propagate untouched —
 * auto-retrying a broadcast tx would re-prompt the wallet.
 * Note: a repay-all capped by the user's balance can revert here legitimately
 * (accrued interest pushed debt past the approved cap); indistinguishable
 * from staleness, so the retries delay that error and the short-circuit
 * branch spends a no-op forceApprove — one prompt plus gas, two for
 * USDT-style tokens — before it surfaces. Consciously accepted.
 */
export async function repayWithStaleSimulationRetry(params: {
  execute: () => Promise<RepayResult>;
  approveSent: boolean;
  forceApprove: () => Promise<void>;
}): Promise<RepayResult> {
  const { execute, approveSent, forceApprove } = params;

  try {
    return await execute();
  } catch (firstError) {
    if (!isStaleAllowanceSimulationError(firstError)) throw firstError;
    logger.warn("Repay simulation saw a stale allowance; retrying", {
      data: { attempt: 1, approveSent },
    });
    await abortableSleep(REPAY_STALE_SIM_RETRY_DELAY_MS);
  }

  try {
    return await execute();
  } catch (secondError) {
    if (!isStaleAllowanceSimulationError(secondError)) throw secondError;
    logger.warn("Repay simulation saw a stale allowance; retrying", {
      data: { attempt: 2, approveSent },
    });
    // Approve was skipped on a possibly stale-high read; force it once.
    if (!approveSent) await forceApprove();
    await abortableSleep(REPAY_STALE_SIM_RETRY_DELAY_MS);
  }

  return execute();
}
