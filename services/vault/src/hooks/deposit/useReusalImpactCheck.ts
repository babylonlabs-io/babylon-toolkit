/**
 * Pre-signing advisory: warn if the predicted coin selection overlaps
 * a pending vault's committed outpoints. Two clicks: the first trips
 * the banner, the second proceeds. The acknowledgement is tied to the
 * exact overlapping-vault id set, so any input change that alters the
 * overlap re-trips with the new set.
 */
import {
  DUST_THRESHOLD,
  findOverlappingPendingVaults,
  selectUtxosForPegin,
  type UTXO,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { useCallback, useRef, useState } from "react";
import type { Address } from "viem";

import { useVaults } from "@/hooks/useVaults";
import { getPendingPegins } from "@/storage/peginStorage";

export type ReusalCheckResult = "pass" | "tripped";

interface UseReusalImpactCheckParams {
  ethAddress: Address | undefined;
  spendableUTXOs: UTXO[] | undefined;
  estimatedFeeRate: number;
  /** Per-vault depositor claim reserve (sats). Added to each HTLC value
   * inside `buildPrePeginPsbt` — included here so the prediction targets
   * the same total as the real signing path. */
  depositorClaimValue: bigint | undefined;
  /** Per-vault minimum peg-in fee (sats). Same rationale as above. */
  minPeginFee: bigint | null;
}

function impactedKey(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}

export function useReusalImpactCheck({
  ethAddress,
  spendableUTXOs,
  estimatedFeeRate,
  depositorClaimValue,
  minPeginFee,
}: UseReusalImpactCheckParams) {
  const { data: depositorVaults } = useVaults(ethAddress);
  // The id set currently shown in the banner; null = no banner.
  const [shownImpacted, setShownImpacted] = useState<string[] | null>(null);
  // Key of the impacted set the user has already clicked through.
  const armedKeyRef = useRef<string | null>(null);

  const runCheck = useCallback(
    (vaultAmounts: readonly bigint[]): ReusalCheckResult => {
      const sumPeginAmounts = vaultAmounts.reduce((s, a) => s + a, 0n);
      const perVaultExtras =
        (depositorClaimValue ?? 0n) + (minPeginFee ?? 0n);
      // Mirrors `prePegin.totalOutputValue`: HTLC values + CPFP anchor.
      const predictedTarget =
        sumPeginAmounts +
        BigInt(vaultAmounts.length) * perVaultExtras +
        DUST_THRESHOLD;
      // Matches `peginOutputCount(vaultCount, hasAuthAnchor=true)`.
      const numOutputs = vaultAmounts.length + 2;

      const selection = selectUtxosForPegin(
        spendableUTXOs ?? [],
        predictedTarget,
        estimatedFeeRate,
        numOutputs,
      );
      // Cross-device cases rely on the indexer; `useVaults` is not
      // polled, so a stale indexer leaves the advisory leaning on local
      // state alone — accepted as a tradeoff for an advisory-only check.
      const impacted = findOverlappingPendingVaults({
        selectedOutpoints: selection.selectedUTXOs.map((u) => ({
          txid: u.txid,
          vout: u.vout,
        })),
        vaults: depositorVaults ?? [],
        pendingPegins: getPendingPegins(ethAddress ?? ""),
      });

      if (impacted.length === 0) {
        if (shownImpacted) setShownImpacted(null);
        armedKeyRef.current = null;
        return "pass";
      }

      const key = impactedKey(impacted);

      // Already armed for this exact overlap.
      if (armedKeyRef.current === key) return "pass";

      // Banner showed the same overlap — second click is the ack.
      if (shownImpacted && impactedKey(shownImpacted) === key) {
        armedKeyRef.current = key;
        setShownImpacted(null);
        return "pass";
      }

      // New or changed overlap — trip with the new set.
      setShownImpacted(impacted);
      return "tripped";
    },
    [
      shownImpacted,
      ethAddress,
      spendableUTXOs,
      estimatedFeeRate,
      depositorClaimValue,
      minPeginFee,
      depositorVaults,
    ],
  );

  return {
    reusalImpactCount: shownImpacted?.length ?? null,
    runCheck,
  };
}
