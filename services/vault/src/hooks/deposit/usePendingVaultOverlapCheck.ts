/**
 * UTXO-overlap advisory: predicts the SDK's coin selection and reports
 * how many of the depositor's pending vaults share an outpoint with it.
 * Informational only — the modal banner does not block.
 */
import {
  DUST_THRESHOLD,
  findOverlappingPendingVaults,
  selectUtxosForPegin,
  type UTXO,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { useCallback } from "react";
import type { Address } from "viem";

import { useVaults } from "@/hooks/useVaults";
import { getPendingPegins } from "@/storage/peginStorage";

interface UsePendingVaultOverlapCheckParams {
  ethAddress: Address | undefined;
  spendableUTXOs: UTXO[] | undefined;
  estimatedFeeRate: number;
  /** Per-vault claim reserve (sats) — must match the signing-path target. */
  depositorClaimValue: bigint | undefined;
  /** Per-vault minimum peg-in fee (sats) — must match the signing-path target. */
  minPeginFee: bigint | null;
}

export function usePendingVaultOverlapCheck({
  ethAddress,
  spendableUTXOs,
  estimatedFeeRate,
  depositorClaimValue,
  minPeginFee,
}: UsePendingVaultOverlapCheckParams) {
  const { data: depositorVaults } = useVaults(ethAddress);

  return useCallback(
    (vaultAmounts: readonly bigint[]): number | null => {
      const sumPeginAmounts = vaultAmounts.reduce((s, a) => s + a, 0n);
      const perVaultExtras = (depositorClaimValue ?? 0n) + (minPeginFee ?? 0n);
      // Mirrors `prePegin.totalOutputValue`: HTLC values + CPFP anchor.
      const predictedTarget =
        sumPeginAmounts +
        BigInt(vaultAmounts.length) * perVaultExtras +
        DUST_THRESHOLD;
      // Matches `peginOutputCount(vaultCount, hasAuthAnchor=true)`.
      const numOutputs = vaultAmounts.length + 2;

      let selection;
      try {
        selection = selectUtxosForPegin(
          spendableUTXOs ?? [],
          predictedTarget,
          estimatedFeeRate,
          numOutputs,
        );
      } catch {
        // Let the real signing path surface insufficient-funds errors.
        return null;
      }
      // `useVaults` is not polled — stale state is acceptable for an advisory.
      const overlapping = findOverlappingPendingVaults({
        selectedOutpoints: selection.selectedUTXOs.map((u) => ({
          txid: u.txid,
          vout: u.vout,
        })),
        vaults: depositorVaults ?? [],
        pendingPegins: getPendingPegins(ethAddress ?? ""),
      });

      return overlapping.length > 0 ? overlapping.length : null;
    },
    [
      ethAddress,
      spendableUTXOs,
      estimatedFeeRate,
      depositorClaimValue,
      minPeginFee,
      depositorVaults,
    ],
  );
}
