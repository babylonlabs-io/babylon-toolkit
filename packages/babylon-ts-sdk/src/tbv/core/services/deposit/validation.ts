/**
 * Pure validation functions for deposit operations.
 *
 * All validations return a consistent {@link ValidationResult} format or throw
 * on critical failures (e.g. missing protocol participants).
 *
 * Business rules (single-provider limit, max vault count) and form-flow
 * checks (wallet connected) belong in the consumer layer.
 *
 * @module tbv/core/services/deposit/validation
 */

import { stripHexPrefix } from "../../primitives/utils/bitcoin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Parameters for checking if a deposit form is valid.
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

export interface RemainingCapacityParams {
  /** Requested deposit amount in satoshis */
  amount: bigint;
  /**
   * Effective remaining capacity in satoshis (min of protocol-total and
   * per-address remaining). `null` means no cap applies.
   */
  effectiveRemaining: bigint | null;
}

/** Narrow structural type for UTXO — avoids importing vault-specific types. */
interface UtxoLike {
  txid: string;
  vout: number;
  value: number;
}

/**
 * Parameters for validating multi-vault deposit flow inputs.
 *
 * Callers must resolve any async loading states before calling — the SDK
 * validates resolved data, not React hook state.
 *
 * Form-flow checks (wallet connected, provider selected) are the caller's
 * responsibility and are NOT performed here.
 */
export interface MultiVaultDepositFlowInputs {
  vaultAmounts: bigint[];
  confirmedUTXOs: UtxoLike[];
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

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const SATOSHIS_PER_BTC = 100_000_000n;

function formatSatoshisToBtc(satoshis: bigint): string {
  const whole = satoshis / SATOSHIS_PER_BTC;
  const fraction = satoshis % SATOSHIS_PER_BTC;
  let fractionStr = fraction.toString().padStart(8, "0");
  fractionStr = fractionStr.replace(/0+$/, "");
  return fractionStr.length > 0 ? `${whole}.${fractionStr}` : whole.toString();
}

function isValidXOnlyHex(hex: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hex);
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/**
 * Check if deposit amount is within valid range and balance.
 *
 * This is a quick check for the form CTA button — it does NOT account for
 * transaction fees or depositor claim value. Full balance validation
 * (including fees) happens at transaction build time in the review modal.
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

  if (amountSats <= 0n) return false;
  if (amountSats < minDeposit) return false;
  if (maxDeposit && maxDeposit > 0n && amountSats > maxDeposit) return false;

  if (estimatedFeeSats == null || depositorClaimValue == null) return false;

  const totalRequired = amountSats + estimatedFeeSats + depositorClaimValue;
  if (totalRequired > btcBalance) return false;

  return true;
}

/**
 * Validate deposit amount against minimum and maximum constraints.
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
 * Validate that selected providers exist in the available set.
 *
 * Business rules (e.g. single-provider limit) are the caller's responsibility.
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

  return { valid: true };
}

/**
 * Validate vault amounts array for multi-vault deposits.
 * Checks count, positivity, and per-vault min/max protocol limits.
 *
 * Max vault count limits are the caller's responsibility.
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
 * Validate vault provider BTC public key format.
 */
export function validateVaultProviderPubkey(pubkey: string): ValidationResult {
  const stripped = stripHexPrefix(pubkey);
  if (!isValidXOnlyHex(stripped)) {
    return {
      valid: false,
      error:
        "Invalid pubkey format: must be 64 hex characters (32-byte x-only public key, no 0x prefix)",
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Private helpers for multi-vault validation
// ---------------------------------------------------------------------------

function validateVaultKeepers(vaultKeeperBtcPubkeys: string[]): void {
  if (!vaultKeeperBtcPubkeys || vaultKeeperBtcPubkeys.length === 0) {
    throw new Error(
      "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
    );
  }
}

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

function validateUTXOState(confirmedUTXOs: UtxoLike[]): void {
  if (confirmedUTXOs.length === 0) {
    throw new Error("No spendable UTXOs available");
  }
}

// ---------------------------------------------------------------------------
// Multi-vault composite validation
// ---------------------------------------------------------------------------

/**
 * Validate protocol-level multi-vault deposit inputs.
 * Throws an error if any validation fails.
 *
 * Form-flow checks (wallet connections, provider selection) must be
 * performed by the caller before invoking this function.
 */
export function validateMultiVaultDepositInputs(
  params: MultiVaultDepositFlowInputs,
): void {
  const {
    vaultAmounts,
    confirmedUTXOs,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    minDeposit,
    maxDeposit,
    htlcSecretHexesLength,
    depositorSecretHashesLength,
  } = params;

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

  const amountsValidation = validateVaultAmounts(
    vaultAmounts,
    minDeposit,
    maxDeposit,
  );
  if (!amountsValidation.valid) {
    throw new Error(amountsValidation.error);
  }

  // Vault provider pubkey
  const pubkeyValidation = validateVaultProviderPubkey(vaultProviderBtcPubkey);
  if (!pubkeyValidation.valid) {
    throw new Error(pubkeyValidation.error);
  }

  validateVaultKeepers(vaultKeeperBtcPubkeys);
  validateUniversalChallengers(universalChallengerBtcPubkeys);
  validateUTXOState(confirmedUTXOs);
}
