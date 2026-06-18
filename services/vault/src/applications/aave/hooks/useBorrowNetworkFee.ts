/**
 * Estimates the Ethereum network fee for a borrow transaction.
 *
 * Builds the same adapter `borrow` calldata the submit path uses and estimates
 * its gas. Borrow needs no token approval, so the estimate is available as soon
 * as the entered amount is valid (gate on `enabled`). Mirrors the submit path's
 * inputs: on-chain ERC20 decimals and the reserve→token integrity check, so the
 * fee can't be shown for a transaction the real submit path would reject.
 */

import { buildBorrowTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";

import { useDebouncedValue } from "@/utils/hooks";

import { getAaveAdapterAddress } from "../config";
import { SAFE_TOFIXED_PRECISION } from "../constants";
import { assertReserveMatchesOnChain } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

import { useErc20Decimals } from "./useErc20Decimals";
import {
  FEE_ESTIMATE_DEBOUNCE_MS,
  useEthTxFeeEstimate,
  type EthTxFee,
} from "./useEthTxFeeEstimate";

export function useBorrowNetworkFee({
  reserve,
  amount,
  enabled,
}: {
  reserve: AaveReserveConfig;
  amount: number;
  enabled: boolean;
}): EthTxFee {
  const { address } = useAccount();
  const { reserveId } = reserve;
  const { address: tokenAddress } = reserve.token;

  // On-chain decimals (cached), matching the submit path; fall back to the
  // config value until the one-time read resolves.
  const decimals = useErc20Decimals(tokenAddress) ?? reserve.token.decimals;

  // Debounce the amount so a continuous slider drag settles to one estimate
  // instead of an eth_estimateGas round-trip per tick.
  const debouncedAmount = useDebouncedValue(amount, FEE_ESTIMATE_DEBOUNCE_MS);

  // While a fresh valid amount is still settling, the query is keyed off the
  // stale debounced value — treat that window as loading so the row shows a
  // loader immediately instead of flashing the empty placeholder.
  const isDebouncing = enabled && amount > 0 && amount !== debouncedAmount;

  const fee = useEthTxFeeEstimate({
    account: address,
    enabled: enabled && debouncedAmount > 0,
    queryKey: [
      "borrow",
      address,
      reserveId.toString(),
      debouncedAmount,
      decimals,
    ],
    prepare: async () => {
      if (!address || debouncedAmount <= 0) return null;
      const adapter = getAaveAdapterAddress();
      // Mirror the submit-path integrity guard: if the indexer reserve→token
      // mapping no longer matches on-chain, this throws and the estimate falls
      // back to the empty placeholder rather than pricing the wrong asset.
      await assertReserveMatchesOnChain(adapter, reserveId, tokenAddress);
      // Clamp toFixed precision to SAFE_TOFIXED_PRECISION to avoid IEEE-754
      // artifacts, matching the submit path (useBorrowTransaction).
      const amountBigInt = parseUnits(
        debouncedAmount.toFixed(Math.min(decimals, SAFE_TOFIXED_PRECISION)),
        decimals,
      );
      return buildBorrowTx(adapter, reserveId, amountBigInt, address);
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
