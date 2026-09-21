/**
 * The message for a decoded Hub or Spoke revert on a borrow or repay, scaled
 * and named for the reserve the transaction was for.
 *
 * The borrow and repay hooks map a failure a second time with no ABIs, which
 * cannot decode a Hub selector and falls back to substring rewriting ("Borrow
 * failed: …"). A revert this recognizes is answered here instead.
 *
 * Only a hub the revert can be pinned to is named. A borrow also refreshes the
 * user's risk premium on every hub where they have debt, and that refresh
 * reverts `SpokeNotActive` on an inactive hub, so on a borrow that error could
 * come from another hub and keeps the fixed text. `SpokeHalted` is only checked
 * by the reserve's own draw or restore.
 */

import { formatUnits } from "viem";

import { COPY } from "@/copy";
import { getHubIdentity } from "@/services/aave/hubRegistry";
import { ContractError, getContractErrorArgs } from "@/utils/errors";
import { CONTRACT_ERROR_MESSAGES } from "@/utils/errors/errorMessages";
import { formatAmount, formatDisplayAmount } from "@/utils/formatting";

import { SAFE_TOFIXED_PRECISION } from "../constants";
import type { AaveReserveConfig } from "../services/fetchConfig";

/** Hub and Spoke reverts whose fixed text in errorMessages.ts is the answer. */
const AAVE_REVERT_REASONS = new Set([
  "DrawCapExceeded",
  "InsufficientLiquidity",
  "SpokeNotActive",
  "SpokeHalted",
  "InvalidPremiumChange",
  "ReservePaused",
  "ReserveFrozen",
  "ReserveNotBorrowable",
  "HealthFactorBelowThreshold",
]);

/** Whole tokens carry no decimals. */
const WHOLE_TOKEN_DECIMALS = 0;

function firstBigintArg(error: ContractError): bigint | undefined {
  const arg = getContractErrorArgs(error)?.[0];
  return typeof arg === "bigint" ? arg : undefined;
}

export function describeAaveRevert(
  error: unknown,
  reserve: AaveReserveConfig,
  action: "borrow" | "repay",
): string | undefined {
  if (!(error instanceof ContractError) || error.reason === undefined) {
    return undefined;
  }
  const { reason } = error;
  if (!AAVE_REVERT_REASONS.has(reason)) return undefined;

  const { symbol } = reserve.token;
  const hub = getHubIdentity(reserve.reserve.hub).label;

  if (reason === "DrawCapExceeded") {
    const cap = firstBigintArg(error);
    // The cap is in whole tokens, not base units.
    if (cap !== undefined) {
      return COPY.loans.revert.drawCapExceeded(
        formatAmount(Number(cap), WHOLE_TOKEN_DECIMALS),
        symbol,
        hub,
      );
    }
  }
  if (reason === "InsufficientLiquidity") {
    const liquidity = firstBigintArg(error);
    // Liquidity is in the Hub asset's base units.
    if (liquidity !== undefined) {
      const decimals = reserve.reserve.decimals;
      return COPY.loans.validation.exceedsLiquidity(
        formatDisplayAmount(
          Number(formatUnits(liquidity, decimals)),
          Math.min(decimals, SAFE_TOFIXED_PRECISION),
        ),
        symbol,
        hub,
      );
    }
  }
  if (reason === "SpokeHalted") {
    return COPY.loans.hub.halted(symbol, hub);
  }
  if (reason === "SpokeNotActive" && action === "repay") {
    return COPY.loans.hub.inactive(symbol, hub);
  }
  return CONTRACT_ERROR_MESSAGES[reason];
}
