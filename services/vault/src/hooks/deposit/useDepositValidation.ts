/**
 * Deposit validation hook
 *
 * Handles all validation logic for deposits using pure service functions.
 * Integrates with wallet data, UTXO queries, protocol params from context,
 * and (optionally) the configured application supply cap.
 */

import { useCallback } from "react";

import { useProtocolParamsContext } from "../../context/ProtocolParamsContext";
import type { ValidationResult } from "../../services/deposit";
import { depositService } from "../../services/deposit";

export interface UseDepositValidationResult {
  validateAmount: (amount: string) => ValidationResult;
  validateProviders: (providers: string[]) => ValidationResult;

  availableProviders: string[];
  minDeposit: bigint;
  maxDeposit: bigint;
  /** Effective remaining supply cap in satoshis, or null when no cap applies. */
  effectiveRemaining: bigint | null;
}

export interface UseDepositValidationParams {
  availableProviders?: string[];
  /**
   * Effective remaining application cap in satoshis.
   * Null means no cap applies (unlimited / unknown).
   */
  effectiveRemaining?: bigint | null;
  /**
   * True when the supply cap state is unknown — either the on-chain read is
   * still loading or it errored. When set, amount validation is blocked with
   * an explicit error rather than silently passing as if no cap applied.
   */
  capUnavailable?: boolean;
}

/**
 * Hook for deposit validation logic.
 */
export function useDepositValidation(
  params: UseDepositValidationParams = {},
): UseDepositValidationResult {
  const {
    availableProviders = [],
    effectiveRemaining = null,
    capUnavailable = false,
  } = params;

  const { minDeposit, maxDeposit } = useProtocolParamsContext();

  const validateAmount = useCallback(
    (amount: string): ValidationResult => {
      if (capUnavailable) {
        return {
          valid: false,
          error: "Unable to verify supply cap — please try again",
        };
      }

      const satoshis = depositService.parseBtcToSatoshis(amount);

      const base = depositService.validateDepositAmount(
        satoshis,
        minDeposit,
        maxDeposit,
      );
      if (!base.valid) return base;

      return depositService.validateRemainingCapacity({
        amount: satoshis,
        effectiveRemaining,
      });
    },
    [minDeposit, maxDeposit, effectiveRemaining, capUnavailable],
  );

  const validateProviders = useCallback(
    (selectedProviders: string[]): ValidationResult =>
      depositService.validateProviderSelection(
        selectedProviders,
        availableProviders,
      ),
    [availableProviders],
  );

  return {
    validateAmount,
    validateProviders,
    availableProviders,
    minDeposit,
    maxDeposit,
    effectiveRemaining,
  };
}
