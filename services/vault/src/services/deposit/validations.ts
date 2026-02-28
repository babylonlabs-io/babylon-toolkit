/**
 * Pure validation functions for deposit operations
 * All validations return consistent ValidationResult format
 */

import type { Address } from "viem";

import { stripHexPrefix, validateXOnlyPubkey } from "@/utils/btc";
import { formatSatoshisToBtc } from "@/utils/btcConversion";

import type { UTXO } from "../vault/vaultTransactionService";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Parameters for validating deposit flow inputs before starting
 */
export interface DepositFlowInputs {
  btcAddress: string | undefined;
  depositorEthAddress: Address | undefined;
  amount: bigint;
  selectedProviders: string[];
  confirmedUTXOs: UTXO[] | null;
  isUTXOsLoading: boolean;
  utxoError: Error | null;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  minDeposit: bigint;
  maxDeposit?: bigint;
}

/**
 * Parameters for checking if a deposit form is valid
 */
export interface DepositFormValidityParams {
  /** Deposit amount in satoshis */
  amountSats: bigint;
  /** Minimum deposit from protocol params */
  minDeposit: bigint;
  /** Maximum deposit from protocol params (optional) */
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
  const { amountSats, minDeposit, maxDeposit, btcBalance } = params;

  // Must have a positive amount
  if (amountSats <= 0n) return false;

  // Must meet minimum
  if (amountSats < minDeposit) return false;

  // Must not exceed max deposit (if set)
  if (maxDeposit && maxDeposit > 0n && amountSats > maxDeposit) return false;

  // Must not exceed balance
  if (amountSats > btcBalance) return false;

  return true;
}

/**
 * Descriptive label for the CTA button based on deposit form validation state.
 *
 * @param params - Validation parameters (same as isDepositAmountValid)
 * @returns Label string for the CTA button
 */
export function getDepositButtonLabel(
  params: DepositFormValidityParams,
): string {
  const { amountSats, minDeposit, maxDeposit, btcBalance } = params;

  if (amountSats <= 0n) return "Enter an amount";
  if (btcBalance <= 0n) return "No available balance";
  if (amountSats > btcBalance) return "Insufficient balance";
  if (amountSats < minDeposit)
    return `Minimum ${formatSatoshisToBtc(minDeposit)} BTC`;
  if (maxDeposit && maxDeposit > 0n && amountSats > maxDeposit)
    return `Maximum ${formatSatoshisToBtc(maxDeposit)} BTC`;

  return "Deposit";
}

/**
 * Validate deposit amount against minimum constraint
 * @param amount - Deposit amount in satoshis
 * @param minDeposit - Minimum allowed deposit (from contract)
 * @returns Validation result
 */
export function validateDepositAmount(
  amount: bigint,
  minDeposit: bigint,
  maxDeposit?: bigint,
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
      error: `Minimum deposit is ${formatSatoshisToBtc(minDeposit)} BTC`,
    };
  }

  if (maxDeposit && maxDeposit > 0n && amount > maxDeposit) {
    return {
      valid: false,
      error: `Maximum deposit is ${formatSatoshisToBtc(maxDeposit)} BTC`,
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

// ============================================================================
// Shared Validation Helpers
// ============================================================================

/**
 * Validate wallet connections (both BTC and ETH)
 * @throws Error if either wallet is not connected
 */
function validateWalletConnections(
  btcAddress: string | undefined,
  depositorEthAddress: Address | undefined,
): void {
  if (!btcAddress) {
    throw new Error("BTC wallet not connected");
  }
  if (!depositorEthAddress) {
    throw new Error("ETH wallet not connected");
  }
}

/**
 * Validate vault keepers availability
 * @throws Error if no vault keepers are available
 */
function validateVaultKeepers(vaultKeeperBtcPubkeys: string[]): void {
  if (!vaultKeeperBtcPubkeys || vaultKeeperBtcPubkeys.length === 0) {
    throw new Error(
      "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
    );
  }
}

/**
 * Validate universal challengers availability
 * @throws Error if no universal challengers are available
 */
function validateUniversalChallengers(
  universalChallengerBtcPubkeys: string[],
): void {
  if (
    !universalChallengerBtcPubkeys ||
    universalChallengerBtcPubkeys.length === 0
  ) {
    throw new Error(
      "No universal challengers available. The system requires at least one universal challenger to create a deposit.",
    );
  }
}

/**
 * Validate UTXO state and availability
 * @throws Error if UTXOs are loading, have errors, or are unavailable
 */
function validateUTXOState(
  confirmedUTXOs: UTXO[] | null,
  isUTXOsLoading: boolean,
  utxoError: Error | null,
): void {
  if (isUTXOsLoading) {
    throw new Error("Loading UTXOs...");
  }
  if (utxoError) {
    throw new Error(`Failed to load UTXOs: ${utxoError.message}`);
  }
  if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
    throw new Error("No spendable UTXOs available");
  }
}

/**
 * Validate provider selection (basic check)
 * @throws Error if no providers are selected
 */
function validateProviders(selectedProviders: string[]): void {
  if (!selectedProviders || selectedProviders.length === 0) {
    throw new Error("At least one vault provider required");
  }
}

// ============================================================================
// Single-Vault Deposit Validation
// ============================================================================

/**
 * Validate all deposit inputs before starting the flow.
 * Throws an error if any validation fails.
 */
export function validateDepositInputs(params: DepositFlowInputs): void {
  const {
    btcAddress,
    depositorEthAddress,
    amount,
    selectedProviders,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    minDeposit,
    maxDeposit,
  } = params;

  validateWalletConnections(btcAddress, depositorEthAddress);

  const amountValidation = validateDepositAmount(
    amount,
    minDeposit,
    maxDeposit,
  );
  if (!amountValidation.valid) {
    throw new Error(amountValidation.error);
  }

  validateProviders(selectedProviders);
  validateVaultKeepers(vaultKeeperBtcPubkeys);
  validateUniversalChallengers(universalChallengerBtcPubkeys);
  validateUTXOState(confirmedUTXOs, isUTXOsLoading, utxoError);
}

// ============================================================================
// Multi-Vault Deposit Validations
// ============================================================================

/**
 * Parameters for validating multi-vault deposit flow inputs
 */
export interface MultiVaultDepositFlowInputs {
  btcAddress: string | undefined;
  depositorEthAddress: Address | undefined;
  vaultAmounts: bigint[];
  selectedProviders: string[];
  confirmedUTXOs: UTXO[] | null;
  isUTXOsLoading: boolean;
  utxoError: Error | null;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
}

/**
 * Validate vault amounts array for multi-vault deposits
 * @param amounts - Array of vault amounts in satoshis
 * @returns Validation result
 */
export function validateVaultAmounts(amounts: bigint[]): ValidationResult {
  if (!amounts || amounts.length === 0) {
    return {
      valid: false,
      error: "At least one vault amount required",
    };
  }

  if (amounts.length > 2) {
    return {
      valid: false,
      error: "Maximum 2 vaults supported",
    };
  }

  if (amounts.some((amount) => amount <= 0n)) {
    return {
      valid: false,
      error: "All vault amounts must be positive",
    };
  }

  return { valid: true };
}

/**
 * Validate vault provider BTC public key format
 * @param pubkey - Vault provider BTC public key (with or without 0x prefix)
 * @returns Validation result
 */
export function validateVaultProviderPubkey(pubkey: string): ValidationResult {
  try {
    const stripped = stripHexPrefix(pubkey);
    validateXOnlyPubkey(stripped);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Validate all multi-vault deposit inputs before starting the flow.
 * Throws an error if any validation fails.
 */
export function validateMultiVaultDepositInputs(
  params: MultiVaultDepositFlowInputs,
): void {
  const {
    btcAddress,
    depositorEthAddress,
    vaultAmounts,
    selectedProviders,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  validateWalletConnections(btcAddress, depositorEthAddress);

  // Vault amounts (multi-vault specific)
  const amountsValidation = validateVaultAmounts(vaultAmounts);
  if (!amountsValidation.valid) {
    throw new Error(amountsValidation.error);
  }

  validateProviders(selectedProviders);

  // Vault provider pubkey (multi-vault specific)
  const pubkeyValidation = validateVaultProviderPubkey(vaultProviderBtcPubkey);
  if (!pubkeyValidation.valid) {
    throw new Error(pubkeyValidation.error);
  }

  validateVaultKeepers(vaultKeeperBtcPubkeys);
  validateUniversalChallengers(universalChallengerBtcPubkeys);
  validateUTXOState(confirmedUTXOs, isUTXOsLoading, utxoError);
}
