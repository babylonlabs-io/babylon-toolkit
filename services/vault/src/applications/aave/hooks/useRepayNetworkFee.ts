/**
 * Estimates the Ethereum network fee for a repay transaction.
 *
 * Builds the same adapter `repay` calldata the submit path uses and estimates
 * its gas. Repay pulls the debt token via `transferFrom`, so `eth_estimateGas`
 * reverts until the adapter has allowance — before approval we can't produce a
 * real estimate, so `prepare` returns null (→ `emptyValue`) rather than a guess.
 *
 * Mirrors the submit path's inputs: on-chain ERC20 decimals, the reserve→token
 * integrity check, and — under Max intent — the `maxUint256` repay-all sentinel
 * that `repayMaxCapped`/`repayFull` broadcast, so the fee reflects the actual
 * transaction rather than the typed partial amount.
 */

import { buildRepayTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { maxUint256, parseUnits } from "viem";
import { useAccount } from "wagmi";

import { useDebouncedValue } from "@/utils/hooks";

import { getAaveAdapterAddress } from "../config";
import { SAFE_TOFIXED_PRECISION } from "../constants";
import { assertReserveMatchesOnChain } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";
import { canEstimateRepay } from "../utils/networkFee";

import { useErc20Allowance } from "./useErc20Allowance";
import { useErc20Decimals } from "./useErc20Decimals";
import {
  FEE_ESTIMATE_DEBOUNCE_MS,
  useEthTxFeeEstimate,
  type EthTxFee,
} from "./useEthTxFeeEstimate";

export function useRepayNetworkFee({
  reserve,
  amount,
  enabled,
  isMaxIntent,
}: {
  reserve: AaveReserveConfig;
  amount: number;
  enabled: boolean;
  /**
   * True when the user picked Max. The submit path then sends the repay-all
   * sentinel (`maxUint256`) via `repayMaxCapped`/`repayFull` rather than the
   * typed amount, so the estimate must build the same calldata.
   */
  isMaxIntent: boolean;
}): EthTxFee {
  const { address } = useAccount();
  const { reserveId } = reserve;
  const { address: tokenAddress } = reserve.token;
  const adapter = getAaveAdapterAddress();

  // On-chain decimals (cached), matching the submit path; fall back to the
  // config value until the one-time read resolves.
  const decimals = useErc20Decimals(tokenAddress) ?? reserve.token.decimals;

  // Read the adapter allowance as a keyed query (not inline in `prepare`) so it
  // is part of the estimate's key: when an approval lands the allowance
  // refreshes and the row re-estimates promptly, instead of caching `–` for the
  // estimate's whole staleTime.
  const allowance = useErc20Allowance(
    tokenAddress,
    address,
    adapter,
    enabled && amount > 0,
  );

  // Debounce the amount so a continuous slider drag settles to one estimate
  // instead of an allowance read + eth_estimateGas round-trip per tick.
  const debouncedAmount = useDebouncedValue(amount, FEE_ESTIMATE_DEBOUNCE_MS);

  // While a fresh valid amount is still settling, the query is keyed off the
  // stale debounced value — treat that window as loading so the row shows a
  // loader immediately instead of flashing the empty placeholder.
  const isDebouncing = enabled && amount > 0 && amount !== debouncedAmount;

  const fee = useEthTxFeeEstimate({
    account: address,
    enabled: enabled && debouncedAmount > 0,
    queryKey: [
      "repay",
      address,
      reserveId.toString(),
      tokenAddress,
      debouncedAmount,
      decimals,
      isMaxIntent,
      allowance?.toString() ?? null,
    ],
    prepare: async () => {
      if (!address || debouncedAmount <= 0 || allowance == null) return null;
      // Mirror the submit-path integrity guard before pricing the asset.
      await assertReserveMatchesOnChain(adapter, reserveId, tokenAddress);

      // Clamp toFixed precision to SAFE_TOFIXED_PRECISION to avoid IEEE-754
      // artifacts, matching the submit path (useRepayTransaction partial mode).
      const amountBigInt = parseUnits(
        debouncedAmount.toFixed(Math.min(decimals, SAFE_TOFIXED_PRECISION)),
        decimals,
      );

      // Without sufficient allowance the repay's transferFrom reverts under
      // simulation. Gate on the displayed amount so the row shows emptyValue
      // instead of an error, rather than fabricating a gas figure. (Under Max
      // intent eth_estimateGas itself is the final allowance check — it reverts
      // → null → emptyValue — if the sentinel needs more than is approved.)
      if (!canEstimateRepay(allowance, amountBigInt)) return null;

      // Max intent submits the repay-all sentinel; estimate that calldata so
      // the fee matches the transaction actually broadcast.
      const repayValue = isMaxIntent ? maxUint256 : amountBigInt;
      return buildRepayTx(adapter, address, reserveId, repayValue);
    },
  });

  // Once the amount becomes invalid (`enabled` flips false) React Query still
  // holds the last estimate under the previous debounced key, so gate the
  // returned value on the live amount — the row clears to `–` immediately
  // instead of lingering on a stale fee until the debounce settles.
  const active = enabled && amount > 0;
  return {
    display: active ? fee.display : null,
    isLoading: active && (fee.isLoading || isDebouncing),
  };
}
