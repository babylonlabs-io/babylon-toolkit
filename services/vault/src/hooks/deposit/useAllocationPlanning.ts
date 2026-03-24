/**
 * Hook for computing UTXO allocation plans for multi-vault deposits.
 *
 * Debounces calls to `planUtxoAllocation()` and exposes the resulting
 * strategy, plan, fee estimate, and `canSplit` flag for the deposit form.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useOptimalSplit } from "@/applications/aave/hooks/useOptimalSplit";
import type { AllocationPlan } from "@/services/vault";
import {
  estimatePeginFeeForAllocation,
  planUtxoAllocation,
} from "@/services/vault";

import type { DepositUtxo } from "./depositFlowSteps/types";

const DEBOUNCE_MS = 300;

export interface UseAllocationPlanningParams {
  amountSats: bigint;
  feeRate: number;
  isPartialLiquidation: boolean;
  spendableUTXOs: DepositUtxo[] | undefined;
  btcAddress: string | undefined;
  depositorClaimValue: bigint | undefined;
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
  /** Display label for the split ratio, null when not applicable */
  splitRatioLabel: string | null;
}

export function useAllocationPlanning({
  amountSats,
  feeRate,
  isPartialLiquidation,
  spendableUTXOs,
  btcAddress,
  depositorClaimValue,
}: UseAllocationPlanningParams): UseAllocationPlanningResult {
  const [allocationPlan, setAllocationPlan] = useState<AllocationPlan | null>(
    null,
  );
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute optimal vault split using on-chain risk parameters
  const {
    sacrificialVault,
    protectedVault,
    canSplit: splitParamsCanSplit,
    isLoading: splitParamsLoading,
  } = useOptimalSplit(amountSats);

  const vaultAmounts = useMemo(() => {
    if (amountSats <= 0n || splitParamsLoading || !splitParamsCanSplit)
      return null;
    return [sacrificialVault, protectedVault] as const;
  }, [
    amountSats,
    splitParamsLoading,
    splitParamsCanSplit,
    sacrificialVault,
    protectedVault,
  ]);

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
      feeRate <= 0 ||
      depositorClaimValue == null
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
          depositorClaimValue,
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
  }, [
    isPartialLiquidation,
    vaultAmounts,
    spendableUTXOs,
    btcAddress,
    feeRate,
    depositorClaimValue,
  ]);

  // Compute total fee from the allocation plan
  const totalFeeSats = useMemo(() => {
    if (!allocationPlan || depositorClaimValue == null) return null;

    let total = 0n;

    if (
      allocationPlan.strategy === "SPLIT" &&
      allocationPlan.splitTransaction
    ) {
      // SPLIT strategy: fee = split TX fee + per-vault pegin fees
      // Split TX fee = sum(input values) - sum(output values)
      const splitTx = allocationPlan.splitTransaction;
      const inputTotal = splitTx.inputs.reduce(
        (sum, u) => sum + BigInt(u.value),
        0n,
      );
      const outputTotal = splitTx.outputs.reduce(
        (sum, o) => sum + o.amount,
        0n,
      );
      total += inputTotal - outputTotal;

      // Per-vault pegin fees: each split output is sized as vault amount + pegin fee buffer
      for (const alloc of allocationPlan.vaultAllocations) {
        if (alloc.fromSplit && alloc.splitTxOutputIndex != null) {
          const splitOutput = splitTx.outputs[alloc.splitTxOutputIndex];
          if (splitOutput) {
            const perVaultFee =
              splitOutput.amount - alloc.amount - depositorClaimValue;
            total += perVaultFee > 0n ? perVaultFee : 0n;
          }
        }
      }
    } else {
      // MULTI_INPUT strategy: fee = estimated pegin fee per vault
      // Each vault's pegin tx fee depends on its input count.
      // The excess UTXO value beyond (amount + depositorClaimValue + fee) is
      // change returned to the user, NOT fee.
      for (const alloc of allocationPlan.vaultAllocations) {
        total += estimatePeginFeeForAllocation(alloc.utxos.length, feeRate);
      }
    }

    return total;
  }, [allocationPlan, depositorClaimValue, feeRate]);

  // canSplit: whether the current UTXOs + amount allow splitting into 2 vaults.
  // Requires both: risk-parameter feasibility (splitParamsCanSplit) AND
  // UTXO feasibility (enough UTXOs to fund both vaults).
  // When allocationPlan is already computed (partial liquidation is on), reuse it
  // to avoid a redundant synchronous planUtxoAllocation() call (which may invoke
  // WASM) on every render during slider drags.
  const canSplit = useMemo(() => {
    if (!splitParamsCanSplit) return false;
    if (allocationPlan) return true;
    if (!vaultAmounts || !spendableUTXOs?.length || !btcAddress || feeRate <= 0)
      return false;
    try {
      planUtxoAllocation(
        spendableUTXOs,
        [...vaultAmounts],
        feeRate,
        btcAddress,
        depositorClaimValue,
      );
      return true;
    } catch {
      return false;
    }
  }, [
    splitParamsCanSplit,
    allocationPlan,
    vaultAmounts,
    spendableUTXOs,
    btcAddress,
    feeRate,
    depositorClaimValue,
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

  return {
    allocationPlan,
    strategy: allocationPlan?.strategy ?? null,
    totalFeeSats,
    isPlanning: isPlanning || splitParamsLoading,
    planError,
    canSplit,
    splitRatioLabel,
  };
}
