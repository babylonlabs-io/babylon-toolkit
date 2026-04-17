/**
 * Deposit validation — wraps SDK protocol validators with vault-specific
 * business rules (single-provider limit, max vault count, wallet checks)
 * and provides CTA display logic.
 */

import {
  validateMultiVaultDepositInputs as sdkValidateMultiVaultDepositInputs,
  validateProviderSelection as sdkValidateProviderSelection,
  validateVaultAmounts as sdkValidateVaultAmounts,
  type DepositFormValidityParams,
  type MultiVaultDepositFlowInputs,
  type ValidationResult,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { formatSatoshisToBtc } from "@/utils/btcConversion";

export {
  isDepositAmountValid,
  validateDepositAmount,
  validateRemainingCapacity,
  validateVaultProviderPubkey,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

export type {
  DepositFormValidityParams,
  MultiVaultDepositFlowInputs,
  RemainingCapacityParams,
  ValidationResult,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

// ---------------------------------------------------------------------------
// Vault-specific wrappers (add business rules on top of SDK protocol checks)
// ---------------------------------------------------------------------------

export interface VaultMultiVaultDepositInputs
  extends MultiVaultDepositFlowInputs {
  btcAddress: string | undefined;
  depositorEthAddress: string | undefined;
  selectedProviders: string[];
}

export function validateProviderSelection(
  selectedProviders: string[],
  availableProviders: string[],
): ValidationResult {
  if (selectedProviders?.length > 1) {
    return {
      valid: false,
      error: "Multiple providers not yet supported",
    };
  }
  return sdkValidateProviderSelection(selectedProviders, availableProviders);
}

export function validateVaultAmounts(
  amounts: bigint[],
  minDeposit?: bigint,
  maxDeposit?: bigint,
): ValidationResult {
  if (amounts?.length > 2) {
    return {
      valid: false,
      error: "Maximum 2 vaults supported",
    };
  }
  return sdkValidateVaultAmounts(amounts, minDeposit, maxDeposit);
}

export function validateMultiVaultDepositInputs(
  params: VaultMultiVaultDepositInputs,
): void {
  if (!params.btcAddress) {
    throw new Error("BTC wallet not connected");
  }
  if (!params.depositorEthAddress) {
    throw new Error("ETH wallet not connected");
  }
  if (!params.selectedProviders || params.selectedProviders.length === 0) {
    throw new Error("At least one vault provider required");
  }
  if (params.selectedProviders.length > 1) {
    throw new Error("Multiple providers not yet supported");
  }
  if (params.vaultAmounts.length > 2) {
    throw new Error("Maximum 2 vaults supported");
  }

  sdkValidateMultiVaultDepositInputs(params);
}

// ---------------------------------------------------------------------------
// CTA display logic (vault-only, not protocol logic)
// ---------------------------------------------------------------------------

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

  const amountLabel = getDepositButtonLabel(params);
  if (amountLabel !== "Deposit") {
    return { disabled: true, label: amountLabel };
  }

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
