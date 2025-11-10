/**
 * Pure transformation functions for deposit data
 * Convert between different data formats without side effects
 */

import type { Hex } from "viem";

import {
  formatSatoshisToBtc,
  parseBtcToSatoshis,
} from "../../utils/btcConversion";
import type { UTXO } from "../vault/vaultTransactionService";

export interface DepositFormData {
  amount: string;
  selectedProviders: string[];
}

export interface DepositTransactionData {
  depositorBtcPubkey: string;
  depositorEthAddress: Hex;
  pegInAmount: bigint;
  vaultProviderAddress: Hex;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  selectedUTXOs: UTXO[];
  fee: bigint;
  unsignedTxHex?: string;
}

/**
 * Transform form data to transaction parameters
 * @param formData - Raw form data
 * @param walletData - Wallet-specific data
 * @returns Transaction-ready parameters
 */
export function transformFormToTransactionData(
  formData: DepositFormData,
  walletData: {
    btcPubkey: string;
    ethAddress: Hex;
  },
  providerData: {
    address: Hex;
    btcPubkey: string;
    liquidatorPubkeys: string[];
  },
  utxoData: {
    selectedUTXOs: UTXO[];
    fee: bigint;
  },
): DepositTransactionData {
  return {
    depositorBtcPubkey: walletData.btcPubkey,
    depositorEthAddress: walletData.ethAddress,
    pegInAmount: BigInt(formData.amount),
    vaultProviderAddress: providerData.address,
    vaultProviderBtcPubkey: providerData.btcPubkey,
    liquidatorBtcPubkeys: providerData.liquidatorPubkeys,
    selectedUTXOs: utxoData.selectedUTXOs,
    fee: utxoData.fee,
  };
}

/**
 * Transform UTXO format from API to internal format
 * @param apiUtxo - UTXO from API
 * @returns Internal UTXO format
 */
export function transformApiUtxoToInternal(apiUtxo: any): UTXO {
  return {
    txid: apiUtxo.txid || apiUtxo.tx_id,
    vout: apiUtxo.vout || apiUtxo.output_index,
    value: apiUtxo.value || apiUtxo.amount,
    scriptPubKey: apiUtxo.scriptPubKey || apiUtxo.script_pubkey,
  };
}

/**
 * Transform provider data for display
 * @param provider - Raw provider data
 * @returns Display-ready provider info
 */
export function transformProviderForDisplay(provider: {
  address: string;
  name?: string;
  btc_pub_key: string;
}): {
  id: string;
  name: string;
  btcPubkey: string;
  displayName: string;
} {
  const shortAddress = `${provider.address.slice(0, 6)}...${provider.address.slice(-4)}`;

  return {
    id: provider.address,
    name: provider.name || shortAddress,
    btcPubkey: provider.btc_pub_key,
    displayName: provider.name || `Provider ${shortAddress}`,
  };
}

/**
 * Calculate deposit progress percentage
 * @param currentStatus - Current contract status
 * @returns Progress percentage (0-100)
 */
export function calculateDepositProgress(
  currentStatus: ContractStatus,
): number {
  switch (currentStatus) {
    case ContractStatus.PENDING:
      return 25;
    case ContractStatus.VERIFIED:
      return 50;
    case ContractStatus.AVAILABLE:
      return 100;
    case ContractStatus.IN_POSITION:
      return 100;
    case ContractStatus.EXPIRED:
      return 100;
    default:
      return 0;
  }
}

/**
 * Transform error to user-friendly message
 * @param error - Raw error
 * @returns User-friendly error message
 */
export function transformErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    // Handle specific error types
    if (error.message.includes("insufficient")) {
      return "Insufficient balance for this transaction";
    }
    if (error.message.includes("rejected")) {
      return "Transaction was rejected";
    }
    if (error.message.includes("timeout")) {
      return "Request timed out. Please try again";
    }

    return error.message;
  }

  return "An unexpected error occurred";
}

// Re-export BTC conversion utilities for convenience
// These are now maintained in the utils directory
export { formatSatoshisToBtc, parseBtcToSatoshis };
