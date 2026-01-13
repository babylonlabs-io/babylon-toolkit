import {
  DUMMY_POP_SIGNATURE,
  encodeSubmitPeginCalldata,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";
import { formatEther, type Address } from "viem";
import { useEstimateGas, useGasPrice } from "wagmi";

import { CONTRACTS } from "../../config/contracts";

/** Buffer percentage for ETH gas estimate (20% = 120/100) */
const ETH_GAS_ESTIMATE_BUFFER_PERCENT = 120n;

/**
 * Parameters for ETH fee estimation
 */
export interface EstimatedEthFeeParams {
  /** Unsigned BTC transaction hex (funded, ready for signing) */
  unsignedTxHex: string | null;
  /** Depositor's BTC public key (x-only, 64 hex chars, no 0x prefix) */
  depositorBtcPubkey?: string;
  /** Depositor's ETH address */
  depositorEthAddress?: Address;
  /** Vault provider's ETH address */
  vaultProviderAddress?: Address;
}

/**
 * Hook to estimate ETH gas fee for the submitPeginRequest transaction.
 *
 * This hook encodes the contract calldata using a dummy signature (since the actual
 * signature isn't available at review time) and estimates gas using eth_estimateGas.
 *
 * @param params - Parameters needed to build the transaction calldata
 * @returns Estimated ETH fee in ETH (as a number), or null if unavailable
 */
export function useEstimatedEthFee(
  params: EstimatedEthFeeParams,
): number | null {
  const {
    unsignedTxHex,
    depositorBtcPubkey,
    depositorEthAddress,
    vaultProviderAddress,
  } = params;

  const { data: gasPrice } = useGasPrice();

  // Encode the contract calldata using shared utility
  const callData = useMemo(() => {
    // Need all parameters to encode calldata
    if (
      !unsignedTxHex ||
      !depositorBtcPubkey ||
      !depositorEthAddress ||
      !vaultProviderAddress
    ) {
      return null;
    }

    try {
      // Use shared utility with dummy signature for gas estimation
      return encodeSubmitPeginCalldata({
        depositorEthAddress,
        depositorBtcPubkey,
        btcPopSignature: DUMMY_POP_SIGNATURE,
        unsignedPegInTx: unsignedTxHex,
        vaultProvider: vaultProviderAddress,
      });
    } catch (err) {
      console.error("Failed to encode submitPeginRequest calldata:", err);
      return null;
    }
  }, [
    unsignedTxHex,
    depositorBtcPubkey,
    depositorEthAddress,
    vaultProviderAddress,
  ]);

  // Estimate gas using wagmi hook
  const { data: gasEstimate } = useEstimateGas({
    to: CONTRACTS.BTC_VAULTS_MANAGER,
    data: callData ?? undefined,
    account: depositorEthAddress,
    query: {
      enabled: !!callData && !!depositorEthAddress,
    },
  });

  const estimatedEthFee = useMemo(() => {
    if (!gasEstimate || !gasPrice) return null;

    const gasWithBuffer =
      (gasEstimate * ETH_GAS_ESTIMATE_BUFFER_PERCENT) / 100n;
    const feeInWei = gasWithBuffer * gasPrice;

    return parseFloat(formatEther(feeInWei));
  }, [gasEstimate, gasPrice]);

  return estimatedEthFee;
}
