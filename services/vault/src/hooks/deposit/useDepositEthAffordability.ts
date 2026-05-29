/**
 * Pre-checks whether the connected Ethereum wallet can afford the on-chain
 * pegin registration tx (`submitPeginRequestBatch`) before the user commits to
 * a deposit. Required ETH = protocol pegin fee (the tx `value`, the dominant
 * cost) + estimated gas.
 *
 * `feeWei` (already batch-scaled, a pure view read that always resolves) is the
 * authoritative floor: a wallet below it is blocked regardless of the gas
 * estimate. The gas term is a best-effort refinement — `estimateSubmitPegin-
 * RequestBatchGas` simulates with the user's own account and the tx `value`, so
 * it can revert for an underfunded wallet; on any failure we fall back to the
 * fee-only floor rather than failing the whole check.
 *
 * Advisory and fail-open: while the reads are loading or errored, `hasEnough`
 * is `null` (the caller must not block on it). The submit-time `estimateGas` in
 * PeginManager remains the authoritative backstop.
 */

import { estimateSubmitPeginRequestBatchGas } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { CONTRACTS } from "@/config/contracts";

// Multiplier on the estimated gas cost (6/5 = 1.2x). Covers gas-price drift
// between this pre-check and submit, and the gap between `getGasPrice()`
// (effective) and the `maxFeePerGas` a wallet reserves under EIP-1559. Safety
// margin only — the submit-time `estimateGas` is authoritative.
const GAS_BUFFER_NUMERATOR = 6n;
const GAS_BUFFER_DENOMINATOR = 5n;

const STALE_TIME_MS = 30_000;

export interface DepositEthAffordability {
  /** `true`/`false` once known; `null` while loading, errored, or disabled. */
  hasEnough: boolean | null;
  /** Distinguishes a settled affordability-read error from the loading state. */
  isError: boolean;
}

export function useDepositEthAffordability(params: {
  ethAddress: Address | undefined;
  vaultProvider: Address | undefined;
  batchSize: number;
  /** Batch-scaled protocol pegin fee in wei (from `useDepositPeginFee`). */
  feeWei: bigint | null;
  enabled: boolean;
}): DepositEthAffordability {
  const { ethAddress, vaultProvider, batchSize, feeWei, enabled } = params;

  const queryEnabled =
    enabled &&
    !!ethAddress &&
    !!vaultProvider &&
    feeWei != null &&
    batchSize >= 1;

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "depositEthAffordability",
      ethAddress?.toLowerCase() ?? null,
      vaultProvider?.toLowerCase() ?? null,
      batchSize,
      feeWei?.toString() ?? null,
    ],
    queryFn: async () => {
      // Narrowing for the type-checker; `queryEnabled` already guards these.
      if (!ethAddress || !vaultProvider || feeWei == null) {
        throw new Error("missing inputs for ETH affordability check");
      }

      const publicClient = ethClient.getPublicClient();
      const balanceWei = await publicClient.getBalance({ address: ethAddress });

      // Gas is best-effort. The estimator simulates with the user's account and
      // `value: totalFee`, so it can revert for an underfunded wallet — exactly
      // the case we want to catch. On any failure, fall back to the fee-only
      // floor; the `feeWei` term below still blocks a wallet that can't cover
      // the dominant cost.
      let gasCostWei = 0n;
      try {
        const [gasUnits, gasPrice] = await Promise.all([
          estimateSubmitPeginRequestBatchGas({
            publicClient,
            btcVaultRegistry: CONTRACTS.BTC_VAULT_REGISTRY,
            depositorEthAddress: ethAddress,
            vaultProvider,
            batchSize,
          }),
          publicClient.getGasPrice(),
        ]);
        gasCostWei =
          (gasUnits * gasPrice * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;
      } catch {
        gasCostWei = 0n;
      }

      return { balanceWei, requiredWei: feeWei + gasCostWei };
    },
    enabled: queryEnabled,
    staleTime: STALE_TIME_MS,
    // Balance is user-mutable: a user who tops up ETH after seeing the block
    // and returns to the tab should be re-checked promptly (the global default
    // is refetchOnWindowFocus: false).
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return useMemo<DepositEthAffordability>(() => {
    if (!queryEnabled || isLoading) {
      return { hasEnough: null, isError: false };
    }
    if (isError || data == null) {
      return { hasEnough: null, isError: true };
    }
    return { hasEnough: data.balanceWei >= data.requiredWei, isError: false };
  }, [queryEnabled, isLoading, isError, data]);
}
