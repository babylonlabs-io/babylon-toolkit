/**
 * Hook to fetch and prepare all data needed for the deposit review modal.
 * Consolidates data fetching logic to keep the modal component focused on rendering.
 */

import { useMemo } from "react";

import { useBTCWallet } from "../../../context/wallet";
import { useEstimatedBtcFee } from "../../../hooks/deposit/useEstimatedBtcFee";
import { useEstimatedEthFee } from "../../../hooks/deposit/useEstimatedEthFee";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import { useBTCPrice } from "../../../hooks/useBTCPrice";
import { useUTXOs } from "../../../hooks/useUTXOs";
import { satoshiToBtcNumber } from "../../../utils/btcConversion";

export interface DepositReviewData {
  // Amount data
  amountBtc: number;
  amountUsd: number | null;

  // Fee data
  btcFee: number | null;
  btcFeeUsd: number | null;
  feeRate: number;
  feeError: string | null;
  ethFee: number | null;

  // Provider data
  selectedProviders: Array<{
    id: string;
    name: string;
    icon: string | null;
  }>;

  // Loading states
  isLoading: {
    price: boolean;
    providers: boolean;
    fee: boolean;
  };
}

/**
 * Fetches and computes all data needed for the deposit review modal.
 *
 * @param amount - Deposit amount in satoshis
 * @param providerIds - Selected provider IDs
 * @param enabled - Whether to enable data fetching (typically tied to modal open state)
 */
export function useDepositReviewData(
  amount: bigint,
  providerIds: string[],
  enabled: boolean,
): DepositReviewData {
  // Fetch wallet and UTXO data
  const { address: btcAddress } = useBTCWallet();
  const { confirmedUTXOs } = useUTXOs(btcAddress, { enabled });

  // Fetch price data
  const { btcPriceUSD, loading: btcPriceLoading } = useBTCPrice();

  // Fetch provider data
  const { findProviders, loading: providersLoading } = useVaultProviders();

  // Fetch fee data
  const {
    fee: feeSats,
    feeRate,
    isLoading: feeLoading,
    error: feeError,
  } = useEstimatedBtcFee(amount, confirmedUTXOs);
  const ethFee = useEstimatedEthFee();

  // Compute derived values
  const computedData = useMemo(() => {
    const amountBtc = satoshiToBtcNumber(amount);
    const amountUsd = btcPriceUSD > 0 ? amountBtc * btcPriceUSD : null;

    const btcFee = feeSats !== null ? satoshiToBtcNumber(feeSats) : null;
    const btcFeeUsd =
      btcFee !== null && btcPriceUSD > 0 ? btcFee * btcPriceUSD : null;

    const selectedProviders = findProviders(providerIds);

    return {
      amountBtc,
      amountUsd,
      btcFee,
      btcFeeUsd,
      selectedProviders,
    };
  }, [amount, btcPriceUSD, feeSats, findProviders, providerIds]);

  return {
    ...computedData,
    feeRate,
    feeError,
    ethFee,
    isLoading: {
      price: btcPriceLoading,
      providers: providersLoading,
      fee: feeLoading,
    },
  };
}
