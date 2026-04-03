/**
 * Deposit validation hook
 *
 * Handles all validation logic for deposits using pure service functions.
 * Integrates with wallet data, UTXO queries, and protocol params from context.
 */

import { useCallback } from "react";

import { useProtocolParamsContext } from "../../context/ProtocolParamsContext";
import type { ValidationResult } from "../../services/deposit";
import { depositService } from "../../services/deposit";

export interface UseDepositValidationResult {
  // Validation functions
  validateAmount: (amount: string) => ValidationResult;
  validateProviders: (providers: string[]) => ValidationResult;

  availableProviders: string[];
  minDeposit: bigint;
  maxDeposit: bigint;
}

/**
 * Hook for deposit validation logic
 *
 * @param availableProviders - List of available provider IDs (must be provided by caller)
 * @returns Validation functions and state
 */
export function useDepositValidation(
  availableProviders: string[] = [],
): UseDepositValidationResult {
  const providers = availableProviders;

  const { minDeposit, maxDeposit } = useProtocolParamsContext();

  // Validate amount using on-chain minDeposit and maxDeposit
  const validateAmount = useCallback(
    (amount: string): ValidationResult => {
      const satoshis = depositService.parseBtcToSatoshis(amount);
      return depositService.validateDepositAmount(
        satoshis,
        minDeposit,
        maxDeposit,
      );
    },
    [minDeposit, maxDeposit],
  );

  // Validate provider selection
  const validateProviders = useCallback(
    (selectedProviders: string[]): ValidationResult => {
      return depositService.validateProviderSelection(
        selectedProviders,
        providers,
      );
    },
    [providers],
  );

  return {
    validateAmount,
    validateProviders,
    availableProviders: providers,
    minDeposit,
    maxDeposit,
  };
}
