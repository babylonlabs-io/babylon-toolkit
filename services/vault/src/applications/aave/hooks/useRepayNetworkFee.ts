/**
 * Estimates the Ethereum network fee for a repay transaction.
 *
 * Builds the same adapter `repay` calldata the submit path uses and estimates
 * its gas. Repay pulls the debt token via `transferFrom`, so `eth_estimateGas`
 * reverts until the adapter has allowance — before approval we can't produce a
 * real estimate, so `prepare` returns null (→ `emptyValue`) rather than a guess.
 */

import { buildRepayTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";

import { ERC20 } from "@/clients/eth-contract";
import { useDebouncedValue } from "@/utils/hooks";

import { getAaveAdapterAddress } from "../config";
import { SAFE_TOFIXED_PRECISION } from "../constants";
import type { AaveReserveConfig } from "../services/fetchConfig";
import { canEstimateRepay } from "../utils/networkFee";

import {
  FEE_ESTIMATE_DEBOUNCE_MS,
  useEthTxFeeEstimate,
  type EthTxFee,
} from "./useEthTxFeeEstimate";

export function useRepayNetworkFee({
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
  const { address: tokenAddress, decimals } = reserve.token;

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
    ],
    prepare: async () => {
      if (!address || debouncedAmount <= 0) return null;
      // Clamp toFixed precision to SAFE_TOFIXED_PRECISION to avoid IEEE-754
      // artifacts, matching the submit path (useRepayTransaction partial mode).
      const amountBigInt = parseUnits(
        debouncedAmount.toFixed(Math.min(decimals, SAFE_TOFIXED_PRECISION)),
        decimals,
      );

      // Without sufficient allowance the repay's transferFrom reverts under
      // simulation. Skip the estimate so the row shows emptyValue instead of an
      // error, rather than fabricating a gas figure.
      const adapter = getAaveAdapterAddress();
      const allowance = await ERC20.getERC20Allowance(
        tokenAddress,
        address,
        adapter,
      );
      if (!canEstimateRepay(allowance, amountBigInt)) return null;

      return buildRepayTx(adapter, address, reserveId, amountBigInt);
    },
  });

  return { display: fee.display, isLoading: fee.isLoading || isDebouncing };
}
