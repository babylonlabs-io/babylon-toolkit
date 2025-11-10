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
