/**
 * Hook for computing vault split amounts for multi-vault deposits.
 *
 * Uses on-chain risk parameters (via useOptimalSplit) to determine
 * whether a 2-vault split is feasible and what the vault amounts should be.
 */

import { useMemo } from "react";

import { useOptimalSplit } from "@/applications/aave/hooks/useOptimalSplit";
import { useETHWallet } from "@/context/wallet";

export interface UseAllocationPlanningParams {
  amountSats: bigint;
  isPartialLiquidation: boolean;
}

export interface UseAllocationPlanningResult {
  /** Per-vault amounts when splitting, null when not applicable */
  vaultAmounts: readonly [bigint, bigint] | null;
  /** Whether the current amount allows splitting into 2 vaults */
  canSplit: boolean;
  /** Display label for the split ratio, null when not applicable */
  splitRatioLabel: string | null;
  /** Minimum deposit required to split across two vaults, in satoshis */
  minDepositForSplit: bigint;
  /**
   * True when the entered amount is a valid, positive amount that falls below
   * the two-vault split minimum — i.e. the split is unavailable specifically
   * because the deposit is too low (not because params are loading or the
   * amount is zero/out of range). Drives the "increase your deposit" hint.
   */
  isSplitAmountTooLow: boolean;
  /** Whether split params are still loading */
  isLoading: boolean;
}

export function useAllocationPlanning({
  amountSats,
  isPartialLiquidation,
}: UseAllocationPlanningParams): UseAllocationPlanningResult {
  // Pass the connected ETH address so useVaultSplitParams can prefer the
  // user's existing position's dynamicConfigKey over the reserve's current
  // key (positions are insulated from reserve config rotations until
  // refresh — see Spoke.sol liquidation path).
  const { address: ethAddress } = useETHWallet();
  const {
    sacrificialVault,
    protectedVault,
    canSplit,
    minDepositForSplit,
    isLoading,
  } = useOptimalSplit(amountSats, ethAddress);

  const vaultAmounts = useMemo(() => {
    if (!isPartialLiquidation || !canSplit || amountSats <= 0n) return null;
    return [sacrificialVault, protectedVault] as const;
  }, [
    isPartialLiquidation,
    canSplit,
    amountSats,
    sacrificialVault,
    protectedVault,
  ]);

  const splitRatioLabel = useMemo(() => {
    if (!canSplit || amountSats <= 0n) return null;
    const total = sacrificialVault + protectedVault;
    if (total === 0n) return null;
    // Safe: BTC amounts in sats fit within Number.MAX_SAFE_INTEGER (max ~2.1e15 sats < 9e15)
    const sacrificialPct = Math.round(
      (Number(sacrificialVault) / Number(total)) * 100,
    );
    const protectedPct = 100 - sacrificialPct;
    return `${sacrificialPct}/${protectedPct}`;
  }, [canSplit, amountSats, sacrificialVault, protectedVault]);

  // The split is unavailable purely because the amount is below the minimum:
  // params have loaded (minDepositForSplit > 0), the user entered a positive
  // amount, and it sits under the threshold. Excludes the zero-amount and
  // out-of-range cases, where minDepositForSplit is 0.
  const isSplitAmountTooLow =
    !isLoading &&
    minDepositForSplit > 0n &&
    amountSats > 0n &&
    amountSats < minDepositForSplit;

  return {
    vaultAmounts,
    canSplit,
    splitRatioLabel,
    minDepositForSplit,
    isSplitAmountTooLow,
    isLoading,
  };
}
