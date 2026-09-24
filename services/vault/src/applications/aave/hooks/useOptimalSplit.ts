/**
 * Hook for computing the optimal vault split for a given deposit amount.
 *
 * Combines the split parameters (from useVaultSplitParams) with the SDK
 * split computation to determine sacrificial and protected vault sizes.
 */

import {
  computeMinDepositForSplit,
  computeOptimalSplit,
  findSplitSizingViolation,
  type SplitParamsViolation,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

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
  /**
   * Why the split parameters refuse a two-vault split, or null when they
   * allow one. Independent of the deposit amount.
   */
  sizingViolation: SplitParamsViolation | null;
  /** Whether split params are still loading */
  isLoading: boolean;
  /**
   * True only when the parameters are missing because their read failed. A
   * failed background refetch leaves the previous values cached, and a split
   * sized from them is still correct, so the error alone must not withdraw
   * the split.
   */
  isParamsUnavailable: boolean;
}

// Bitcoin's max supply in satoshis (21M BTC). Larger amounts would trip the
// SDK's precision guard, so bail before computing the split.
const MAX_PLAUSIBLE_DEPOSIT_SATS = 2_100_000_000_000_000n;

const EMPTY_RESULT: Omit<
  UseOptimalSplitResult,
  "isLoading" | "isParamsUnavailable"
> = {
  sacrificialVault: 0n,
  protectedVault: 0n,
  seizedFraction: 0,
  canSplit: false,
  minDepositForSplit: 0n,
  sizingViolation: null,
};

export function useOptimalSplit(
  totalBtc: bigint,
  connectedAddress?: string,
): UseOptimalSplitResult {
  const { params, isLoading, error } = useVaultSplitParams(connectedAddress);
  const { minDeposit } = useProtocolParamsContext();

  const result = useMemo(() => {
    // A null bonus means the Spoke's curve is out of range. Every seizure
    // formula below needs it, and substituting any other value would size the
    // split against a bonus the protocol would not apply, so the split is
    // refused the same way an unreadable parameter set is.
    if (!params || params.LB === null) {
      return EMPTY_RESULT;
    }

    const { THF, expectedHF, CF, LB } = params;

    // Checked before the amount so the refusal shows even with an empty form.
    const sizingViolation = findSplitSizingViolation({
      CF,
      LB,
      THF,
      expectedHF,
    });
    if (sizingViolation !== null) {
      return { ...EMPTY_RESULT, sizingViolation };
    }

    if (totalBtc <= 0n || totalBtc > MAX_PLAUSIBLE_DEPOSIT_SATS) {
      return EMPTY_RESULT;
    }

    const split = computeOptimalSplit({ totalBtc, CF, LB, THF, expectedHF });

    const minDepositForSplit = computeMinDepositForSplit({
      minPegin: minDeposit,
      seizedFraction: split.seizedFraction,
    });

    // The parameters passed above, so a refusal here is amount-driven — dust,
    // or rounding that ties the two vaults — and the amount is below the split
    // minimum anyway. Nothing to report as a parameter problem.
    const canSplit =
      split.sizingViolation === null &&
      minDepositForSplit > 0n &&
      totalBtc >= minDepositForSplit;

    return {
      sacrificialVault: split.sacrificialVault,
      protectedVault: split.protectedVault,
      seizedFraction: split.seizedFraction,
      canSplit,
      minDepositForSplit,
      sizingViolation: null,
    };
  }, [params, totalBtc, minDeposit]);

  return {
    ...result,
    isLoading,
    isParamsUnavailable: (!params && error !== null) || params?.LB === null,
  };
}
