/**
 * Hook to fetch and prepare all data needed for the deposit review modal.
 * Consolidates data fetching logic to keep the modal component focused on rendering.
 */

import { useMemo } from "react";

import { useBTCWallet } from "../../../context/wallet";
import { useEstimatedBtcFee } from "../../../hooks/deposit/useEstimatedBtcFee";
import { useEstimatedEthFee } from "../../../hooks/deposit/useEstimatedEthFee";
import { useUnsignedPeginTx } from "../../../hooks/deposit/useUnsignedPeginTx";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import { useBtcPublicKey } from "../../../hooks/useBtcPublicKey";
import { usePrices } from "../../../hooks/usePrices";
import { useUTXOs } from "../../../hooks/useUTXOs";
import { satoshiToBtcNumber } from "../../../utils/btcConversion";

/**
 * Helper to calculate USD value from amount and price.
 * Returns null if either value is missing or price is zero.
 */
function toUsd(amount: number | null, priceUsd: number): number | null {
  if (amount === null || priceUsd <= 0) return null;
  return amount * priceUsd;
}

export interface DepositReviewData {
  // Amount data
  amountBtc: number;
  amountBtcUsd: number | null;

  // Fee data
  btcFee: number | null;
  btcFeeUsd: number | null;
  feeRate: number;
  feeError: string | null;
  ethFee: number | null;
  ethFeeUsd: number | null;

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
 * Parameters needed to build the unsigned pegin transaction for ETH gas estimation
 */
export interface PeginParams {
  /** Application controller address (for provider lookup) */
  selectedApplication: string;
  /** Vault provider's BTC public key (x-only, 64 hex chars) */
  vaultProviderBtcPubkey: string;
  /** Liquidator BTC public keys (x-only, 64 hex chars each) */
  liquidatorBtcPubkeys: string[];
}

/**
 * Fetches and computes all data needed for the deposit review modal.
 *
 * @param amount - Deposit amount in satoshis
 * @param providerIds - Selected provider IDs
 * @param enabled - Whether to enable data fetching (typically tied to modal open state)
 * @param peginParams - Parameters for building the unsigned pegin transaction
 */
export function useDepositReviewData(
  amount: bigint,
  providerIds: string[],
  enabled: boolean,
  peginParams?: PeginParams,
): DepositReviewData {
  // Fetch wallet data
  const { address: btcAddress, connected: btcConnected } = useBTCWallet();
  const depositorBtcPubkey = useBtcPublicKey(btcConnected);

  // Fetch UTXO data
  const { confirmedUTXOs } = useUTXOs(btcAddress, { enabled });

  // Fetch price data
  const { prices, isLoading: priceLoading } = usePrices();
  const btcPriceUSD = prices.BTC ?? 0;
  const ethPriceUSD = prices.ETH ?? 0;

  // Fetch provider data
  const { findProviders, loading: providersLoading } = useVaultProviders(
    peginParams?.selectedApplication,
  );

  // Fetch fee data (also provides selectedUTXOs for building tx)
  const {
    fee: feeSats,
    feeRate,
    isLoading: feeLoading,
    error: feeError,
  } = useEstimatedBtcFee(amount, confirmedUTXOs);

  // Build the unsigned pegin transaction for ETH gas estimation
  const unsignedPeginTxParams = useMemo(() => {
    if (!peginParams?.vaultProviderBtcPubkey || !btcAddress) return null;
    return {
      amount,
      depositorBtcPubkey,
      btcAddress,
      confirmedUTXOs,
      feeRate,
      vaultProviderBtcPubkey: peginParams.vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: peginParams.liquidatorBtcPubkeys,
    };
  }, [
    amount,
    depositorBtcPubkey,
    btcAddress,
    confirmedUTXOs,
    feeRate,
    peginParams,
  ]);

  const unsignedTxHex = useUnsignedPeginTx(unsignedPeginTxParams);

  // Estimate ETH gas using the unsigned transaction
  const ethFee = useEstimatedEthFee(unsignedTxHex);

  // Compute derived BTC values
  const amountBtc = satoshiToBtcNumber(amount);
  const btcFee = feeSats !== null ? satoshiToBtcNumber(feeSats) : null;

  // Get selected providers
  const selectedProviders = findProviders(providerIds);

  return {
    // Amount data
    amountBtc,
    amountBtcUsd: toUsd(amountBtc, btcPriceUSD),

    // Fee data
    btcFee,
    btcFeeUsd: toUsd(btcFee, btcPriceUSD),
    feeRate,
    feeError,
    ethFee,
    ethFeeUsd: toUsd(ethFee, ethPriceUSD),

    // Provider data
    selectedProviders,

    // Loading states
    isLoading: {
      price: priceLoading,
      providers: providersLoading,
      fee: feeLoading,
    },
  };
}
