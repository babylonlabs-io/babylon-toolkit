/**
 * Hook for computing UTXO allocation plans for multi-vault deposits.
 *
 * Debounces calls to `planUtxoAllocation()` and exposes the resulting
 * strategy, plan, fee estimate, and `canSplit` flag for the deposit form.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { AllocationPlan } from "@/services/vault";
import { planUtxoAllocation } from "@/services/vault";

import type { DepositUtxo } from "./depositFlowSteps/types";

const DEBOUNCE_MS = 300;

export interface UseAllocationPlanningParams {
  amountSats: bigint;
  feeRate: number;
  isPartialLiquidation: boolean;
  spendableUTXOs: DepositUtxo[] | undefined;
  btcAddress: string | undefined;
}

export interface UseAllocationPlanningResult {
  /** The computed allocation plan, or null if not applicable */
  allocationPlan: AllocationPlan | null;
  /** Selected strategy ("SINGLE" | "MULTI_INPUT" | "SPLIT"), null when inactive */
  strategy: AllocationPlan["strategy"] | null;
  /** Total estimated fees in sats for the multi-vault deposit */
  totalFeeSats: bigint | null;
  /** Whether planning is in progress */
  isPlanning: boolean;
  /** Error message if planning failed */
  planError: string | null;
  /** Whether the current UTXOs + amount allow splitting into 2 vaults */
  canSplit: boolean;
}

export function useAllocationPlanning({
  amountSats,
  feeRate,
  isPartialLiquidation,
  spendableUTXOs,
  btcAddress,
}: UseAllocationPlanningParams): UseAllocationPlanningResult {
  const [allocationPlan, setAllocationPlan] = useState<AllocationPlan | null>(
    null,
  );
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute vault amounts: split evenly into 2 vaults
  const vaultAmounts = useMemo(() => {
    if (amountSats <= 0n) return null;
    const half = amountSats / 2n;
    return [half, amountSats - half] as const;
  }, [amountSats]);

  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Skip planning when disabled or missing data
    if (
      !isPartialLiquidation ||
      !vaultAmounts ||
      !spendableUTXOs?.length ||
      !btcAddress ||
      feeRate <= 0
    ) {
      setAllocationPlan(null);
      setPlanError(null);
      setIsPlanning(false);
      return;
    }

    setIsPlanning(true);

    debounceRef.current = setTimeout(() => {
      try {
        const plan = planUtxoAllocation(
          spendableUTXOs,
          [...vaultAmounts],
          feeRate,
          btcAddress,
        );
        setAllocationPlan(plan);
        setPlanError(null);
      } catch (err) {
        setAllocationPlan(null);
        setPlanError(
          err instanceof Error ? err.message : "Failed to plan allocation",
        );
      } finally {
        setIsPlanning(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [isPartialLiquidation, vaultAmounts, spendableUTXOs, btcAddress, feeRate]);

  // Compute total fee from the allocation plan
  const totalFeeSats = useMemo(() => {
    if (!allocationPlan) return null;
    // Sum per-vault pegin fees from the allocation
    let total = 0n;
    for (const alloc of allocationPlan.vaultAllocations) {
      // Each allocation's UTXOs have a fee component
      // For SPLIT: includes the split TX fee in the split transaction
      const utxoValue = alloc.utxos.reduce(
        (sum, u) => sum + BigInt(u.value),
        0n,
      );
      if (utxoValue > alloc.amount) {
        total += utxoValue - alloc.amount;
      }
    }
    return total;
  }, [allocationPlan]);

  // canSplit: try planning to see if splitting is possible
  // This runs even when isPartialLiquidation is false to enable the checkbox
  const canSplit = useMemo(() => {
    if (!vaultAmounts || !spendableUTXOs?.length || !btcAddress || feeRate <= 0)
      return false;
    try {
      planUtxoAllocation(
        spendableUTXOs,
        [...vaultAmounts],
        feeRate,
        btcAddress,
      );
      return true;
    } catch {
      return false;
    }
  }, [vaultAmounts, spendableUTXOs, btcAddress, feeRate]);

  return {
    allocationPlan,
    strategy: allocationPlan?.strategy ?? null,
    totalFeeSats,
    isPlanning,
    planError,
    canSplit,
  };
}
