/**
 * Pure transformation functions for deposit data
 * Convert between different data formats without side effects
 */

import type { Hex } from "viem";
import type { VaultActivity } from "../../types/activity";
import type { UTXO } from "../vault/vaultTransactionService";
import { 
  ContractStatus, 
  LocalStorageStatus,
  type PeginDisplayLabel 
} from "../../models/peginStateMachine";

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
  unsignedTxHex: string;
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
  }
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
    unsignedTxHex: "" // Will be filled by WASM
  };
}

/**
 * Transform contract status to display label
 * @param contractStatus - Smart contract status enum
 * @param localStatus - Local storage status (optional)
 * @returns Human-readable label
 */
export function transformStatusToLabel(
  contractStatus: ContractStatus,
  localStatus?: LocalStorageStatus
): PeginDisplayLabel {
  // Local status takes precedence for user feedback
  if (localStatus === LocalStorageStatus.CONFIRMING) {
    return "Pending Bitcoin Confirmations";
  }
  if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
    return "Processing";
  }
  
  // Map contract status to display label
  switch (contractStatus) {
    case ContractStatus.PENDING:
      return "Pending";
    case ContractStatus.VERIFIED:
      return "Verified";
    case ContractStatus.AVAILABLE:
      return "Available";
    case ContractStatus.IN_POSITION:
      return "In Use";
    case ContractStatus.EXPIRED:
      return "Expired";
    default:
      return "Unknown";
  }
}

/**
 * Transform deposit transaction result to activity format
 * @param txData - Transaction data
 * @param result - Transaction result
 * @returns Vault activity format
 */
export function transformDepositToActivity(
  txData: DepositTransactionData,
  result: {
    btcTxid: string;
    ethTxHash: Hex;
    timestamp: number;
  }
): Partial<VaultActivity> {
  return {
    id: result.btcTxid,
    txHash: result.ethTxHash as Hex,
    collateral: {
      amount: txData.pegInAmount.toString(),
      symbol: "BTC",
      icon: "/images/btc.svg"
    },
    providers: [{
      id: txData.vaultProviderAddress,
      name: `Provider ${txData.vaultProviderAddress.slice(0, 6)}...`,
      icon: undefined
    }],
    contractStatus: ContractStatus.PENDING,
    isPending: true,
    pendingMessage: "Waiting for provider acknowledgments"
  };
}

/**
 * Transform satoshi amounts to display format
 * @param satoshis - Amount in satoshis
 * @param decimals - Number of decimal places
 * @returns Formatted BTC string
 */
export function formatSatoshisToBtc(
  satoshis: bigint,
  decimals: number = 8
): string {
  const SATOSHIS_PER_BTC = 100_000_000n;
  const whole = satoshis / SATOSHIS_PER_BTC;
  const fraction = satoshis % SATOSHIS_PER_BTC;
  
  // Get fractional part as string, pad with leading zeros to 8 digits
  let fractionStr = fraction.toString().padStart(8, '0').slice(0, decimals);
  // Remove trailing zeros from fractional part
  fractionStr = fractionStr.replace(/0+$/, '');
  
  return fractionStr.length > 0 ? `${whole.toString()}.${fractionStr}` : whole.toString();
}

/**
 * Parse BTC string to satoshis
 * @param btcAmount - BTC amount as string
 * @returns Amount in satoshis
 */
export function parseBtcToSatoshis(btcAmount: string): bigint {
  // Remove any non-numeric characters except decimal
  const cleanAmount = btcAmount.replace(/[^0-9.]/g, '');
  
  // Validate input: must not be empty, must contain at most one decimal point
  if (
    !cleanAmount ||
    cleanAmount === '.' ||
    (cleanAmount.match(/\./g) || []).length > 1
  ) {
    return 0n;
  }
  
  // Handle decimal places
  const [whole, decimal = ''] = cleanAmount.split('.');
  // If whole is empty (e.g., ".5"), treat as "0"
  const safeWhole = whole === '' ? '0' : whole;
  const paddedDecimal = decimal.padEnd(8, '0').slice(0, 8);
  const satoshis = safeWhole + paddedDecimal;
  
  // Validate satoshis is a valid integer string
  if (!/^\d+$/.test(satoshis)) {
    return 0n;
  }
  
  return BigInt(satoshis);
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
    scriptPubKey: apiUtxo.scriptPubKey || apiUtxo.script_pubkey
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
    displayName: provider.name || `Provider ${shortAddress}`
  };
}

/**
 * Calculate deposit progress percentage
 * @param currentStatus - Current contract status
 * @returns Progress percentage (0-100)
 */
export function calculateDepositProgress(
  currentStatus: ContractStatus
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
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    // Handle specific error types
    if (error.message.includes('insufficient')) {
      return 'Insufficient balance for this transaction';
    }
    if (error.message.includes('rejected')) {
      return 'Transaction was rejected';
    }
    if (error.message.includes('timeout')) {
      return 'Request timed out. Please try again';
    }
    
    return error.message;
  }
  
  return 'An unexpected error occurred';
}
