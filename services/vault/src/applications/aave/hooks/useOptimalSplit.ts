/**
 * Hook for computing the optimal vault split for a given deposit amount.
 *
 * Combines on-chain risk parameters (from useVaultSplitParams) with
 * SDK split computation to determine sacrificial and protected vault sizes.
 */

import {
  computeMinDepositForSplit,
  computeOptimalSplit,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

import {
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  VAULT_SPLIT_SAFETY_MARGIN,
} from "../constants";

import { useVaultSplitParams } from "./useVaultSplitParams";

export interface UseOptimalSplitResult {
  /** Sacrificial vault amount in satoshis (index 0, seized first) */
  sacrificialVault: bigint;
  /** Protected vault amount in satoshis (index 1, survives liquidation) */
  protectedVault: bigint;
  /** Fraction of collateral that would be seized (0-1) */
  seizedFraction: number;
  /** Whether the deposit is large enough for a 2-vault split */
  canSplit: boolean;
  /** Minimum deposit required for a split, in satoshis */
  minDepositForSplit: bigint;
  /** Whether split params are still loading */
  isLoading: boolean;
  /** Error from param fetching */
  error: Error | null;
}

// Bitcoin's fixed maximum supply in satoshis (21,000,000 BTC × 1e8). Any
// amount above this is invalid input and would trip the SDK's
// assertSafePrecision guard (RangeError). We reject it with an explicit error
// rather than computing the split or returning a silent zero result.
const MAX_PLAUSIBLE_DEPOSIT_SATS = 2_100_000_000_000_000n;

const EMPTY_RESULT: Omit<UseOptimalSplitResult, "isLoading" | "error"> = {
  sacrificialVault: 0n,
  protectedVault: 0n,
  seizedFraction: 0,
  canSplit: false,
  minDepositForSplit: 0n,
};

export function useOptimalSplit(
  totalBtc: bigint,
  connectedAddress?: string,
): UseOptimalSplitResult {
  const { params, isLoading, error } = useVaultSplitParams(connectedAddress);
  const { minDeposit } = useProtocolParamsContext();

  const { result, amountError } = useMemo(() => {
    // An oversized amount is invalid input, not a no-split: surface an explicit
    // error instead of a zeroed result that downstream split planning can't
    // distinguish from a normal empty/no-split state.
    if (totalBtc > MAX_PLAUSIBLE_DEPOSIT_SATS) {
      return {
        result: EMPTY_RESULT,
        amountError: new RangeError(
          "Deposit amount exceeds the maximum supported value.",
        ),
      };
    }

    if (!params || totalBtc <= 0n) {
      return { result: EMPTY_RESULT, amountError: null };
    }

    const { THF, CF, LB } = params;

    const split = computeOptimalSplit({
      totalBtc,
      CF,
      LB,
      THF,
      expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
      safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
    });

    const minDepositForSplit = computeMinDepositForSplit({
      minPegin: minDeposit,
      seizedFraction: split.seizedFraction,
      safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
    });

    const canSplit = minDepositForSplit > 0n && totalBtc >= minDepositForSplit;

    return {
      result: {
        sacrificialVault: split.sacrificialVault,
        protectedVault: split.protectedVault,
        seizedFraction: split.seizedFraction,
        canSplit,
        minDepositForSplit,
      },
      amountError: null,
    };
  }, [params, totalBtc, minDeposit]);

  return {
    ...result,
    isLoading,
    // Surface oversized-amount errors alongside param-fetch errors so an
    // invalid amount isn't masked as a valid empty result.
    error: error ?? amountError,
  };
}
