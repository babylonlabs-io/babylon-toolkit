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
  /** Estimated transaction fee in satoshis */
  estimatedFeeSats?: bigint;
  /** Depositor claim value in satoshis (required output for challenge transactions) */
  depositorClaimValue?: bigint;
}

/**
 * Check if deposit amount is within valid range and balance.
 *
 * This is a quick check for the form CTA button — it does NOT account for
 * transaction fees or depositor claim value. Full balance validation
 * (including fees) happens at transaction build time in the review modal.
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
    maxDeposit,
    btcBalance,
    estimatedFeeSats,
    depositorClaimValue,
  } = params;

  // Must have a positive amount
  if (amountSats <= 0n) return false;

  // Must meet minimum
  if (amountSats < minDeposit) return false;

  // Must not exceed max deposit (if set)
  if (maxDeposit && maxDeposit > 0n && amountSats > maxDeposit) return false;

  // Fees and claim value must be known before validating balance
  if (estimatedFeeSats == null || depositorClaimValue == null) return false;

  // Must not exceed balance (including estimated fees and depositor claim value)
  const totalRequired = amountSats + estimatedFeeSats + depositorClaimValue;
  if (totalRequired > btcBalance) return false;

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
  const {
    amountSats,
    minDeposit,
    maxDeposit,
    btcBalance,
    estimatedFeeSats,
    depositorClaimValue,
  } = params;

  if (amountSats <= 0n) return "Enter an amount";
  if (btcBalance <= 0n) return "No available balance";
  if (estimatedFeeSats == null || depositorClaimValue == null)
    return "Calculating fees...";

  const totalRequired = amountSats + estimatedFeeSats + depositorClaimValue;
  if (totalRequired > btcBalance) return "Insufficient balance";

  if (amountSats < minDeposit)
    return `Minimum ${formatSatoshisToBtc(minDeposit)} BTC`;
  if (maxDeposit && maxDeposit > 0n && amountSats > maxDeposit)
    return `Maximum ${formatSatoshisToBtc(maxDeposit)} BTC`;

  return "Deposit";
}

// ---------------------------------------------------------------------------
// Unified CTA state — single source of truth for label + disabled
// ---------------------------------------------------------------------------

/**
 * All inputs needed to determine the deposit CTA button state.
 * Extends amount-validation params with form-level and system-level flags.
 */
export interface DepositCtaParams extends DepositFormValidityParams {
  isDepositDisabled: boolean;
  isGeoBlocked: boolean;
  isWalletConnected: boolean;
  hasApplication: boolean;
  hasProvider: boolean;
  splitNotReady: boolean;
  isFeeError: boolean;
  feeError: string | null;
  feeDisabled: boolean;
}

export interface DepositCtaState {
  disabled: boolean;
  label: string;
}

/**
 * Single source of truth for the deposit CTA button.
 *
 * Returns both `disabled` and `label` so they can never be out of sync.
 * Checks are ordered by priority — the first matching condition wins.
 */
export function getDepositCtaState(params: DepositCtaParams): DepositCtaState {
  if (params.isDepositDisabled) {
    return { disabled: true, label: "Depositing Unavailable" };
  }

  if (params.isGeoBlocked) {
    return { disabled: true, label: "Service unavailable in your region" };
  }

  if (!params.isWalletConnected) {
    return { disabled: true, label: "Connect your wallet" };
  }

  if (!params.hasApplication) {
    return { disabled: true, label: "Select an application" };
  }

  if (!params.hasProvider) {
    return { disabled: true, label: "Select a vault provider" };
  }

  if (params.splitNotReady) {
    return {
      disabled: true,
      label: "Deposit amount too low for 2-vault split",
    };
  }

  // Amount-level validation first — handles "Enter an amount", "No available
  // balance", "Calculating fees...", min/max, and balance checks.  Must run
  // before fee-disabled so that empty-form states are not masked.
  const amountLabel = getDepositButtonLabel(params);
  if (amountLabel !== "Deposit") {
    return { disabled: true, label: amountLabel };
  }

  // Fee edge-cases that getDepositButtonLabel cannot catch (e.g. fee rate is
  // still loading while a stale estimatedFeeSats is cached).
  if (params.isFeeError) {
    return {
      disabled: true,
      label: params.feeError ?? "Fee estimate unavailable",
    };
  }

  if (params.feeDisabled) {
    return { disabled: true, label: "Calculating fees..." };
  }

  return { disabled: false, label: "Deposit" };
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

export interface RemainingCapacityParams {
  /** Requested deposit amount in satoshis */
  amount: bigint;
  /**
   * Effective remaining capacity in satoshis (min of protocol-total and
   * per-address remaining). `null` means no cap applies.
   */
  effectiveRemaining: bigint | null;
}

/**
 * Validate that the requested deposit fits within the effective remaining cap.
 */
export function validateRemainingCapacity(
  params: RemainingCapacityParams,
): ValidationResult {
  const { amount, effectiveRemaining } = params;
  if (effectiveRemaining === null) return { valid: true };

  if (effectiveRemaining === 0n) {
    return {
      valid: false,
      error: "Supply cap reached — deposits temporarily paused",
    };
  }

  if (amount > effectiveRemaining) {
    return {
      valid: false,
      error: `Vault size exceeds remaining capacity (${formatSatoshisToBtc(effectiveRemaining)} BTC)`,
    };
  }

  return { valid: true };
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
  /** Protocol minimum deposit per vault (satoshis) */
  minDeposit: bigint;
  /** Protocol maximum deposit per vault (satoshis) */
  maxDeposit?: bigint;
  /** Number of HTLC secret hexes — must match vaultAmounts.length */
  htlcSecretHexesLength: number;
  /** Number of depositor secret hashes — must match vaultAmounts.length */
  depositorSecretHashesLength: number;
}

/**
 * Validate vault amounts array for multi-vault deposits.
 * Checks count, positivity, and per-vault min/max protocol limits.
 */
export function validateVaultAmounts(
  amounts: bigint[],
  minDeposit?: bigint,
  maxDeposit?: bigint,
): ValidationResult {
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

  for (let i = 0; i < amounts.length; i++) {
    const amount = amounts[i];
    if (amount <= 0n) {
      return {
        valid: false,
        error: `Vault ${i + 1} amount must be positive`,
      };
    }
    if (minDeposit && amount < minDeposit) {
      return {
        valid: false,
        error: `Vault ${i + 1} amount ${formatSatoshisToBtc(amount)} BTC is below minimum deposit ${formatSatoshisToBtc(minDeposit)} BTC`,
      };
    }
    if (maxDeposit && amount > maxDeposit) {
      return {
        valid: false,
        error: `Vault ${i + 1} amount ${formatSatoshisToBtc(amount)} BTC exceeds maximum deposit ${formatSatoshisToBtc(maxDeposit)} BTC`,
      };
    }
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
    minDeposit,
    maxDeposit,
    htlcSecretHexesLength,
    depositorSecretHashesLength,
  } = params;

  validateWalletConnections(btcAddress, depositorEthAddress);

  // Array alignment: all per-vault arrays must have the same length
  const vaultCount = vaultAmounts.length;
  if (htlcSecretHexesLength !== vaultCount) {
    throw new Error(
      `htlcSecretHexes length (${htlcSecretHexesLength}) must match vaultAmounts length (${vaultCount})`,
    );
  }
  if (depositorSecretHashesLength !== vaultCount) {
    throw new Error(
      `depositorSecretHashes length (${depositorSecretHashesLength}) must match vaultAmounts length (${vaultCount})`,
    );
  }

  // Vault amounts with per-vault min/max checks
  const amountsValidation = validateVaultAmounts(
    vaultAmounts,
    minDeposit,
    maxDeposit,
  );
  if (!amountsValidation.valid) {
    throw new Error(amountsValidation.error);
  }

  // Per-vault min/max deposit validation
  for (let i = 0; i < vaultAmounts.length; i++) {
    const amountValidation = validateDepositAmount(
      vaultAmounts[i],
      minDeposit,
      maxDeposit,
    );
    if (!amountValidation.valid) {
      throw new Error(`Vault ${i + 1}: ${amountValidation.error}`);
    }
  }

  validateProviders(selectedProviders);

  // Vault provider pubkey
  const pubkeyValidation = validateVaultProviderPubkey(vaultProviderBtcPubkey);
  if (!pubkeyValidation.valid) {
    throw new Error(pubkeyValidation.error);
  }

  validateVaultKeepers(vaultKeeperBtcPubkeys);
  validateUniversalChallengers(universalChallengerBtcPubkeys);
  validateUTXOState(confirmedUTXOs, isUTXOsLoading, utxoError);
}
