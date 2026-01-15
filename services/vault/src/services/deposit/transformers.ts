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
  /** Vault keeper BTC public keys (per-application) */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challenger BTC public keys (system-wide) */
  universalChallengerBtcPubkeys: string[];
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
    vaultKeeperPubkeys: string[];
    universalChallengerPubkeys: string[];
  },
  utxoData: {
    selectedUTXOs: UTXO[];
    fee: bigint;
  },
): DepositTransactionData {
  return {
    depositorBtcPubkey: walletData.btcPubkey,
    depositorEthAddress: walletData.ethAddress,
    pegInAmount: parseBtcToSatoshis(formData.amount),
    vaultProviderAddress: providerData.address,
    vaultProviderBtcPubkey: providerData.btcPubkey,
    vaultKeeperBtcPubkeys: providerData.vaultKeeperPubkeys,
    universalChallengerBtcPubkeys: providerData.universalChallengerPubkeys,
    selectedUTXOs: utxoData.selectedUTXOs,
    fee: utxoData.fee,
  };
}

// Re-export BTC conversion utilities for convenience
// These are now maintained in the utils directory
export { formatSatoshisToBtc, parseBtcToSatoshis };
