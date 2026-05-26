/**
 * Deposit validation — wraps SDK protocol validators with vault-specific
 * business rules (single-provider limit, max vault count, wallet checks)
 * and provides CTA display logic.
 */

import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  validateMultiVaultDepositInputs as sdkValidateMultiVaultDepositInputs,
  validateProviderSelection as sdkValidateProviderSelection,
  validateVaultAmounts as sdkValidateVaultAmounts,
  type DepositFormValidityParams,
  type MultiVaultDepositFlowInputs,
  type ValidationResult,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { getBtcSymbol } from "@/utils/formatting";

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
      error: "Maximum 2 BTC Vaults supported",
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
    throw new Error("Maximum 2 BTC Vaults supported");
  }

  sdkValidateMultiVaultDepositInputs(params);
}

// ---------------------------------------------------------------------------
// CTA display logic (vault-only, not protocol logic)
// ---------------------------------------------------------------------------

export interface DepositCtaParams extends DepositFormValidityParams {
  isDepositDisabled: boolean;
  isGeoBlocked: boolean;
  isAddressBlocked: boolean;
  isWalletConnected: boolean;
  hasProvider: boolean;
  isFeeError: boolean;
  feeError: string | null;
  feeDisabled: boolean;
  ordinalsCheckPending: boolean;
  /**
   * True when the click-time BTC-wallet liveness probe (or a prior reconnect
   * attempt) failed. Promotes the CTA to a "Reconnect Wallet" action so the
   * user can re-authorize the wallet in one click instead of navigating an
   * inline warning.
   */
  hasWalletConnectionError: boolean;
  /** True while a reconnect attempt is in flight. Forces the CTA disabled. */
  isReconnectingWallet: boolean;
  /**
   * Fee-adjusted maximum depositable amount in satoshis (balance minus the BTC
   * network fee, and the depositor claim value once a provider is selected).
   * When the entered amount exceeds this, the CTA reports "Insufficient
   * balance" — ahead of the provider prompt, since selecting a provider cannot
   * make an unfundable amount fundable. Null while UTXOs or fee rates load.
   */
  maxDepositSats: bigint | null;
  /**
   * Remaining application supply cap in satoshis (null = no cap, or still
   * loading). Mirrors `validateRemainingCapacity` so the CTA surfaces the same
   * cap-exceeded / cap-reached cases that `validateForm` would silently reject.
   */
  effectiveRemaining: bigint | null;
  /**
   * True when the supply-cap read errored. `validateForm` hard-rejects every
   * amount in this state; the CTA must mirror that or the button shows
   * "Deposit" while clicks silently no-op.
   */
  capUnavailable: boolean;
  /**
   * Exact per-HTLC PegIn (activation) tx fee in satoshis from the WASM
   * `computeMinPeginFee` query. Null while the query is still loading or
   * before vault keepers have been fetched. The CTA must block submission
   * while this is null — otherwise a user can click Max during the loading
   * window, get an inflated Max value (which treats minPeginFee as 0n for
   * display), pass the form, and only fail later in the signing path's
   * real HTLC sizing.
   */
  minPeginFee: bigint | null;
  /**
   * Terminal failure from the `computeMinPeginFee` WASM query (init failure,
   * unsupported signer count, etc.). Surfaced separately from the loading
   * state so the CTA reports an actionable error instead of getting stuck
   * indefinitely on "Calculating fees...".
   */
  minPeginFeeError: Error | null;
}

export interface DepositCtaState {
  disabled: boolean;
  label: string;
}

/**
 * True when a non-zero entered amount exceeds the known fee-adjusted
 * depositable maximum. Returns false while `maxDepositSats` is null (still
 * loading) so the caller doesn't gate behavior on an unknown cap.
 */
export function amountExceedsMax(
  amountSats: bigint,
  maxDepositSats: bigint | null,
): boolean {
  return (
    amountSats > 0n && maxDepositSats != null && amountSats > maxDepositSats
  );
}

/**
 * True when the remaining supply cap is positive but below the protocol minimum
 * deposit. In that state the cap (upper bound) and the minimum (lower bound)
 * leave an empty range — no amount can satisfy both — so deposits are
 * impossible until the cap grows. Surfacing this directly avoids contradictory
 * guidance where the cap check says "lower it" and the minimum check says
 * "raise it". Narrows `effectiveRemaining` to a non-null bigint when true.
 */
export function capBelowMinimum(
  effectiveRemaining: bigint | null,
  minDeposit: bigint,
): effectiveRemaining is bigint {
  return (
    effectiveRemaining !== null &&
    effectiveRemaining > 0n &&
    effectiveRemaining < minDeposit
  );
}

export function capBelowMinimumLabel(
  effectiveRemaining: bigint,
  minDeposit: bigint,
): string {
  return `Remaining capacity (${formatSatoshisToBtc(effectiveRemaining)} BTC) is below the minimum deposit (${formatSatoshisToBtc(minDeposit)} BTC)`;
}

/**
 * True when the fee-adjusted depositable max is positive but below the protocol
 * minimum deposit. In that state the balance/fee ceiling and the minimum lower
 * bound leave an empty range — no amount can satisfy both — so deposits are
 * impossible until the wallet balance grows. Surfacing this directly avoids the
 * dead-end "Minimum X" guidance the user can never satisfy. Narrows
 * `maxDepositSats` to a non-null bigint when true.
 */
export function maxBelowMinimum(
  maxDepositSats: bigint | null,
  minDeposit: bigint,
): maxDepositSats is bigint {
  return (
    maxDepositSats !== null &&
    maxDepositSats > 0n &&
    maxDepositSats < minDeposit
  );
}

export function maxBelowMinimumLabel(
  maxDepositSats: bigint,
  minDeposit: bigint,
): string {
  return `Available balance (${formatSatoshisToBtc(maxDepositSats)} ${getBtcSymbol()}) is below the minimum deposit (${formatSatoshisToBtc(minDeposit)} ${getBtcSymbol()})`;
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
    return `Minimum ${formatSatoshisToBtc(minDeposit)} ${getBtcSymbol()}`;
  if (maxDeposit && maxDeposit > 0n && amountSats > maxDeposit)
    return `Maximum ${formatSatoshisToBtc(maxDeposit)} ${getBtcSymbol()}`;

  return "Deposit";
}

export function getDepositCtaState(params: DepositCtaParams): DepositCtaState {
  if (params.isDepositDisabled) {
    return { disabled: true, label: "Depositing Unavailable" };
  }

  if (params.isGeoBlocked) {
    return { disabled: true, label: "Service unavailable in your region" };
  }

  if (params.isAddressBlocked) {
    return { disabled: true, label: "Wallet not eligible" };
  }

  if (!params.isWalletConnected) {
    return { disabled: true, label: "Connect your wallet" };
  }

  // Promote wallet-liveness failure to the CTA so the user can recover in one
  // click. The button stays enabled (clicking triggers reconnection) unless a
  // reconnect attempt is already running.
  if (params.hasWalletConnectionError) {
    return {
      disabled: params.isReconnectingWallet,
      label: params.isReconnectingWallet
        ? "Reconnecting Wallet..."
        : "Reconnect Wallet",
    };
  }

  // Mirror `validateAmount`'s cap-unavailable hard-reject in the CTA — without
  // this branch, the button reads "Deposit" but `validateForm` silently
  // rejects every click.
  if (params.capUnavailable) {
    return {
      disabled: true,
      label: "Unable to verify supply cap — please try again",
    };
  }

  // Mirror `validateRemainingCapacity` from the SDK. The message strings must
  // match exactly so users see the same wording whether the block surfaces via
  // the CTA or via a future inline error. These run before the generic
  // `amountExceedsMax` check below: `maxDepositSats` is itself clamped to the
  // supply cap, so a cap-bound amount also trips `amountExceedsMax` — and
  // "Insufficient balance" would be wrong when the wallet has ample balance but
  // the supply cap is the real limiter.
  if (params.effectiveRemaining === 0n) {
    return {
      disabled: true,
      label: "Supply cap reached — deposits temporarily paused",
    };
  }
  // No amount can clear both the remaining cap and the protocol minimum — a
  // terminal state, so surface it regardless of the entered amount rather than
  // bouncing between "exceeds capacity" and "minimum" guidance. Mirrored in
  // `useDepositValidation.validateAmount` so the inline/submit path agrees.
  if (capBelowMinimum(params.effectiveRemaining, params.minDeposit)) {
    return {
      disabled: true,
      label: capBelowMinimumLabel(params.effectiveRemaining, params.minDeposit),
    };
  }
  // Symmetric to capBelowMinimum, on the balance/fee dimension: the fee-adjusted
  // max is positive but below the minimum, so no amount clears both bounds.
  // Terminal — surface regardless of the entered amount instead of the dead-end
  // "Minimum X" guidance. `maxDepositSats` is clamped to `effectiveRemaining`,
  // so when the supply cap is the binding cause the capBelowMinimum branch above
  // wins (more specific). Mirrored in useDepositValidation.validateAmount.
  if (maxBelowMinimum(params.maxDepositSats, params.minDeposit)) {
    return {
      disabled: true,
      label: maxBelowMinimumLabel(params.maxDepositSats, params.minDeposit),
    };
  }
  if (
    params.effectiveRemaining !== null &&
    params.amountSats > params.effectiveRemaining
  ) {
    return {
      disabled: true,
      label: `Vault size exceeds remaining capacity (${formatSatoshisToBtc(params.effectiveRemaining)} BTC)`,
    };
  }

  // An amount that exceeds the fee-adjusted depositable balance can never be
  // funded — surface it before the provider prompt, since selecting a provider
  // cannot make an unfundable amount fundable.
  if (amountExceedsMax(params.amountSats, params.maxDepositSats)) {
    return { disabled: true, label: "Insufficient balance" };
  }

  if (!params.hasProvider) {
    return { disabled: true, label: "Select a vault provider" };
  }

  // Surface a terminal `computeMinPeginFee` failure ahead of the "still
  // loading" gate below. Without this branch a query rejection (WASM init
  // failure, unsupported signer count) would leave the CTA stuck on
  // "Calculating fees..." with no error or retry signal.
  if (params.amountSats > 0n && params.minPeginFeeError !== null) {
    return { disabled: true, label: "Fee estimate unavailable" };
  }

  // Block submission while the exact per-HTLC PegIn fee is still loading.
  // `adjustedMaxDepositSats` displays a slightly inflated Max (minPeginFee
  // treated as 0n) until this query resolves; submitting in that window
  // would let an amount that won't actually fund the real HTLC sizing pass
  // validateForm and fail later inside the signing path.
  if (params.amountSats > 0n && params.minPeginFee === null) {
    return { disabled: true, label: "Calculating fees..." };
  }

  const amountLabel = getDepositButtonLabel(params);
  if (amountLabel !== "Deposit") {
    return { disabled: true, label: amountLabel };
  }

  if (params.ordinalsCheckPending) {
    return { disabled: true, label: "Checking for inscriptions..." };
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
