/**
 * useAllocationPlanning — Debounced allocation planning + multi-vault fee estimation.
 *
 * Runs `planUtxoAllocation` as the user types, so the deposit form can:
 *   - Auto-check the "partial liquidation" checkbox when splitting is possible
 *   - Show the correct fee (single pegin vs multi-input vs split)
 *   - Display strategy-specific info text
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  estimatePeginFeeForAllocation,
  estimateSplitTxFee,
  planUtxoAllocation,
  type AllocationPlan,
  type AllocationStrategy,
} from "@/services/vault";

import { useNetworkFees } from "../useNetworkFees";

import { useBtcWalletState } from "./useBtcWalletState";

// ============================================================================
// Types
// ============================================================================

export interface UseAllocationPlanningResult {
  /** Determined allocation strategy, or null if not yet planned */
  strategy: AllocationStrategy | null;
  /** Full allocation plan, or null if not yet planned */
  allocationPlan: AllocationPlan | null;
  /** Total estimated fee in satoshis for the multi-vault strategy */
  totalFee: bigint | null;
  /** Whether the allocation is currently being planned */
  isPlanning: boolean;
  /** Error message if planning failed */
  planError: string | null;
  /** Whether the amount can be split into 2 vaults */
  canSplit: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_MS = 300;

// ============================================================================
// Fee helpers
// ============================================================================

/**
 * Compute the total BTC network fee for a multi-vault allocation plan.
 *
 * - MULTI_INPUT: sum of per-vault pegin fees (based on assigned UTXO counts)
 * - SPLIT: split TX fee + 2 × 1-input pegin fee
 */
function computeMultiVaultFee(plan: AllocationPlan, feeRate: number): bigint {
  if (plan.strategy === "MULTI_INPUT") {
    return plan.vaultAllocations.reduce(
      (sum, alloc) =>
        sum + estimatePeginFeeForAllocation(alloc.utxos.length, feeRate),
      0n,
    );
  }

  if (plan.strategy === "SPLIT" && plan.splitTransaction) {
    const splitFee = estimateSplitTxFee(
      plan.splitTransaction.inputs.length,
      plan.splitTransaction.outputs.length,
      feeRate,
    );
    // Each vault's pegin uses exactly 1 split output as input
    const peginFeePerVault = estimatePeginFeeForAllocation(1, feeRate);
    return splitFee + 2n * peginFeePerVault;
  }

  return 0n;
}

// ============================================================================
// Hook
// ============================================================================

export function useAllocationPlanning(
  amountSats: bigint,
): UseAllocationPlanningResult {
  const { btcAddress, spendableUTXOs } = useBtcWalletState();
  const { defaultFeeRate } = useNetworkFees();

  const [result, setResult] = useState<{
    strategy: AllocationStrategy | null;
    allocationPlan: AllocationPlan | null;
    totalFee: bigint | null;
    canSplit: boolean;
    planError: string | null;
  }>({
    strategy: null,
    allocationPlan: null,
    totalFee: null,
    canSplit: false,
    planError: null,
  });
  const [isPlanning, setIsPlanning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vault amounts for 50/50 split
  const vaultAmounts = useMemo<[bigint, bigint] | null>(() => {
    if (amountSats <= 0n) return null;
    return [amountSats / 2n, amountSats - amountSats / 2n];
  }, [amountSats]);

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Can't plan without data
    if (
      !vaultAmounts ||
      !btcAddress ||
      !spendableUTXOs ||
      spendableUTXOs.length === 0 ||
      defaultFeeRate <= 0
    ) {
      setResult({
        strategy: null,
        allocationPlan: null,
        totalFee: null,
        canSplit: false,
        planError: null,
      });
      setIsPlanning(false);
      return;
    }

    setIsPlanning(true);

    timerRef.current = setTimeout(() => {
      try {
        // Convert spendable UTXOs to SDK UTXO format
        const utxos: UTXO[] = spendableUTXOs.map((u) => ({
          txid: u.txid,
          vout: u.vout,
          value: u.value,
          scriptPubKey: u.scriptPubKey ?? "",
        }));

        const plan = planUtxoAllocation(
          utxos,
          vaultAmounts,
          defaultFeeRate,
          btcAddress,
        );

        const totalFee = computeMultiVaultFee(plan, defaultFeeRate);

        setResult({
          strategy: plan.strategy,
          allocationPlan: plan,
          totalFee,
          canSplit: true,
          planError: null,
        });
      } catch (err) {
        setResult({
          strategy: null,
          allocationPlan: null,
          totalFee: null,
          canSplit: false,
          planError:
            err instanceof Error ? err.message : "Failed to plan allocation",
        });
      } finally {
        setIsPlanning(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [vaultAmounts, btcAddress, spendableUTXOs, defaultFeeRate]);

  return {
    strategy: result.strategy,
    allocationPlan: result.allocationPlan,
    totalFee: result.totalFee,
    isPlanning,
    planError: result.planError,
    canSplit: result.canSplit,
  };
}
