/**
 * Pure validation functions for deposit operations
 * All validations return consistent ValidationResult format
 */

import type { UTXO } from "../vault/vaultTransactionService";

import { MAX_DEPOSIT_SATS } from "./constants";

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
 * Parameters for checking if a deposit form is valid
 */
export interface DepositFormValidityParams {
  /** Deposit amount in satoshis */
  amountSats: bigint;
  /** Minimum deposit from protocol params */
  minDeposit: bigint;
  /** Maximum deposit (defaults to MAX_DEPOSIT_SATS) */
  maxDeposit?: bigint;
  /** User's available BTC balance in satoshis */
  btcBalance: bigint;
}

/**
 * Check if deposit amount is within valid range and balance
 *
 * This is a pure function that validates deposit constraints without side effects.
 * Used by form hooks to determine if the submit button should be enabled.
 *
 * @param params - Validation parameters
 * @returns true if deposit amount is valid
 */
export function isDepositAmountValid(
  params: DepositFormValidityParams,
): boolean {
  const {
    amountSats,
    minDeposit,
    maxDeposit = MAX_DEPOSIT_SATS,
    btcBalance,
  } = params;

  // Must have a positive amount
  if (amountSats <= 0n) return false;

  // Must meet minimum
  if (amountSats < minDeposit) return false;

  // Must not exceed maximum
  if (amountSats > maxDeposit) return false;

  // Must not exceed balance
  if (amountSats > btcBalance) return false;

  return true;
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
  maxDeposit: bigint,
): ValidationResult {
  if (amount <= 0n) {
    return {
      valid: false,
      error: "Deposit amount must be greater than zero",
    };
  }

  if (amount < minDeposit) {
    return {
      valid: false,
      error: `Minimum deposit is ${minDeposit} satoshis`,
    };
  }

  if (amount > maxDeposit) {
    return {
      valid: false,
      error: `Maximum deposit is ${maxDeposit} satoshis`,
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
  availableBalance: bigint,
): ValidationResult {
  if (availableBalance < requiredAmount) {
    const shortage = requiredAmount - availableBalance;
    return {
      valid: false,
      error: `Insufficient balance. Need ${shortage} more satoshis`,
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
  requiredAmount: bigint,
): ValidationResult {
  if (!utxos || utxos.length === 0) {
    return {
      valid: false,
      error: "No UTXOs available for deposit",
    };
  }

  // Check if UTXOs are confirmed (have valid txid and vout)
  const invalidUTXOs = utxos.filter(
    (u) => !u.txid || u.vout === undefined || u.value <= 0,
  );

  if (invalidUTXOs.length > 0) {
    return {
      valid: false,
      error: `${invalidUTXOs.length} invalid UTXOs detected`,
    };
  }

  // Calculate total available from UTXOs
  const totalAvailable = utxos.reduce(
    (sum, utxo) => sum + BigInt(utxo.value),
    0n,
  );

  if (totalAvailable < requiredAmount) {
    return {
      valid: false,
      error: "UTXOs don't have sufficient value for deposit",
    };
  }

  // Warning for too many UTXOs (affects fees)
  const warnings: string[] = [];
  if (utxos.length > 10) {
    warnings.push("Using many UTXOs will increase transaction fees");
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
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
  availableProviders: string[],
): ValidationResult {
  if (!selectedProviders || selectedProviders.length === 0) {
    return {
      valid: false,
      error: "At least one vault provider must be selected",
    };
  }

  // Check if selected providers are valid (case-insensitive comparison for Ethereum addresses)
  const availableProvidersLower = availableProviders.map((p) =>
    p.toLowerCase(),
  );
  const invalidProviders = selectedProviders.filter(
    (p) => !availableProvidersLower.includes(p.toLowerCase()),
  );

  if (invalidProviders.length > 0) {
    return {
      valid: false,
      error: "Invalid vault provider selected",
    };
  }

  // For now, only support single provider
  if (selectedProviders.length > 1) {
    return {
      valid: false,
      error: "Multiple providers not yet supported",
    };
  }

  return { valid: true };
}
