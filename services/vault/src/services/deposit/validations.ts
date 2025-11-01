/**
 * Pure validation functions for deposit operations
 * All validations return consistent ValidationResult format
 */

import type { UTXO } from "../vault/vaultTransactionService";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export interface DepositValidationParams {
  amount: bigint;
  btcBalance: bigint;
  minDeposit: bigint;
  maxDeposit: bigint;
  utxos: UTXO[];
}

/**
 * Validate deposit amount against constraints
 * @param amount - Deposit amount in satoshis
 * @param minDeposit - Minimum allowed deposit
 * @param maxDeposit - Maximum allowed deposit
 * @returns Validation result
 */
export function validateDepositAmount(
  amount: bigint,
  minDeposit: bigint,
  maxDeposit: bigint
): ValidationResult {
  if (amount <= 0n) {
    return { 
      valid: false, 
      error: "Deposit amount must be greater than zero" 
    };
  }
  
  if (amount < minDeposit) {
    return { 
      valid: false, 
      error: `Minimum deposit is ${minDeposit} satoshis` 
    };
  }
  
  if (amount > maxDeposit) {
    return { 
      valid: false, 
      error: `Maximum deposit is ${maxDeposit} satoshis` 
    };
  }
  
  return { valid: true };
}

/**
 * Validate if user has sufficient balance
 * @param requiredAmount - Total required amount (deposit + fees)
 * @param availableBalance - User's available balance
 * @returns Validation result
 */
export function validateSufficientBalance(
  requiredAmount: bigint,
  availableBalance: bigint
): ValidationResult {
  if (availableBalance < requiredAmount) {
    const shortage = requiredAmount - availableBalance;
    return { 
      valid: false, 
      error: `Insufficient balance. Need ${shortage} more satoshis` 
    };
  }
  
  return { valid: true };
}

/**
 * Validate UTXOs for deposit
 * @param utxos - Available UTXOs
 * @param requiredAmount - Required amount for deposit
 * @returns Validation result
 */
export function validateUTXOs(
  utxos: UTXO[],
  requiredAmount: bigint
): ValidationResult {
  if (!utxos || utxos.length === 0) {
    return { 
      valid: false, 
      error: "No UTXOs available for deposit" 
    };
  }
  
  // Check if UTXOs are confirmed (have valid txid and vout)
  const invalidUTXOs = utxos.filter(u => 
    !u.txid || u.vout === undefined || u.value <= 0
  );
  
  if (invalidUTXOs.length > 0) {
    return { 
      valid: false, 
      error: `${invalidUTXOs.length} invalid UTXOs detected` 
    };
  }
  
  // Calculate total available from UTXOs
  const totalAvailable = utxos.reduce(
    (sum, utxo) => sum + BigInt(utxo.value), 
    0n
  );
  
  if (totalAvailable < requiredAmount) {
    return { 
      valid: false, 
      error: "UTXOs don't have sufficient value for deposit" 
    };
  }
  
  // Warning for too many UTXOs (affects fees)
  const warnings: string[] = [];
  if (utxos.length > 10) {
    warnings.push("Using many UTXOs will increase transaction fees");
  }
  
  return { 
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Validate vault provider selection
 * @param selectedProviders - Selected provider addresses
 * @param availableProviders - Available provider addresses
 * @returns Validation result
 */
export function validateProviderSelection(
  selectedProviders: string[],
  availableProviders: string[]
): ValidationResult {
  if (!selectedProviders || selectedProviders.length === 0) {
    return { 
      valid: false, 
      error: "At least one vault provider must be selected" 
    };
  }
  
  // Check if selected providers are valid
  const invalidProviders = selectedProviders.filter(
    p => !availableProviders.includes(p)
  );
  
  if (invalidProviders.length > 0) {
    return { 
      valid: false, 
      error: "Invalid vault provider selected" 
    };
  }
  
  // For now, only support single provider
  if (selectedProviders.length > 1) {
    return { 
      valid: false, 
      error: "Multiple providers not yet supported" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate complete deposit parameters
 * @param params - All deposit parameters
 * @returns Combined validation result
 */
export function validateDepositParameters(
  params: DepositValidationParams
): ValidationResult {
  const { amount, btcBalance, minDeposit, maxDeposit, utxos } = params;
  
  // Run all validations
  const amountValidation = validateDepositAmount(amount, minDeposit, maxDeposit);
  if (!amountValidation.valid) return amountValidation;
  
  const balanceValidation = validateSufficientBalance(amount, btcBalance);
  if (!balanceValidation.valid) return balanceValidation;
  
  const utxoValidation = validateUTXOs(utxos, amount);
  if (!utxoValidation.valid) return utxoValidation;
  
  // Combine warnings if any
  const allWarnings: string[] = [];
  if (utxoValidation.warnings) {
    allWarnings.push(...utxoValidation.warnings);
  }
  
  return { 
    valid: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined
  };
}

/**
 * Validate BTC address format
 * @param address - Bitcoin address
 * @param network - Bitcoin network (mainnet/testnet)
 * @returns Validation result
 */
export function validateBtcAddress(
  address: string,
  network: "mainnet" | "testnet"
): ValidationResult {
  if (!address) {
    return { valid: false, error: "Bitcoin address is required" };
  }
  
  // Basic validation - check prefix
  const validPrefixes = network === "mainnet" 
    ? ["bc1", "1", "3"] 
    : ["tb1", "m", "n", "2"];
  
  const hasValidPrefix = validPrefixes.some(prefix => 
    address.startsWith(prefix)
  );
  
  if (!hasValidPrefix) {
    return { 
      valid: false, 
      error: `Invalid ${network} Bitcoin address format` 
    };
  }
  
  // Check minimum length
  if (address.length < 26) {
    return { valid: false, error: "Bitcoin address too short" };
  }
  
  return { valid: true };
}
