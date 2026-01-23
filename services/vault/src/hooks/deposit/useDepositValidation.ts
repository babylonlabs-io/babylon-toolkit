/**
 * Deposit validation hook
 *
 * Handles all validation logic for deposits using pure service functions.
 * Integrates with wallet data, UTXO queries, and on-chain protocol params.
 */

import { useCallback } from "react";

import type { DepositFormData, ValidationResult } from "../../services/deposit";
import { depositService } from "../../services/deposit";
import { formatErrorMessage } from "../../utils/errors";
import { MAX_DEPOSIT_SATS, usePegInConfig } from "../useProtocolParams";
import { useUTXOs } from "../useUTXOs";

export interface UseDepositValidationResult {
  // Validation functions
  validateAmount: (amount: string) => ValidationResult;
  validateProviders: (providers: string[]) => ValidationResult;
  validateDeposit: (data: DepositFormData) => Promise<ValidationResult>;

  // Available providers (passed in, not fetched)
  availableProviders: string[];

  // Validation state (fetched from contract)
  minDeposit: bigint;
  maxDeposit: bigint;

  // Loading and error state for protocol params
  isLoadingParams: boolean;
  paramsError: Error | null;
}

/**
 * Hook for deposit validation logic
 *
 * @param btcAddress - User's Bitcoin address for UTXO validation
 * @param availableProviders - List of available provider IDs (must be provided by caller)
 * @returns Validation functions and state
 */
export function useDepositValidation(
  btcAddress: string | undefined,
  availableProviders: string[] = [],
): UseDepositValidationResult {
  const providers = availableProviders;

  // Get protocol params from contract
  const {
    minDeposit,
    isLoading: isLoadingParams,
    error: paramsError,
  } = usePegInConfig();

  // Get UTXOs for validation
  const { confirmedUTXOs } = useUTXOs(btcAddress, { enabled: !!btcAddress });

  // Validate amount using on-chain minDeposit
  const validateAmount = useCallback(
    (amount: string): ValidationResult => {
      try {
        const satoshis = depositService.parseBtcToSatoshis(amount);
        return depositService.validateDepositAmount(
          satoshis,
          minDeposit,
          MAX_DEPOSIT_SATS,
        );
      } catch {
        return {
          valid: false,
          error: "Invalid amount format",
        };
      }
    },
    [minDeposit],
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

  // Validate complete deposit
  const validateDeposit = useCallback(
    async (data: DepositFormData): Promise<ValidationResult> => {
      try {
        // Parse amount
        const amount = depositService.parseBtcToSatoshis(data.amount);

        // Validate amount
        const amountValidation = validateAmount(data.amount);
        if (!amountValidation.valid) return amountValidation;

        // Validate providers
        const providerValidation = validateProviders(data.selectedProviders);
        if (!providerValidation.valid) return providerValidation;

        // Validate UTXOs if available
        if (confirmedUTXOs && confirmedUTXOs.length > 0) {
          const utxoValidation = depositService.validateUTXOs(
            confirmedUTXOs,
            amount,
          );

          if (!utxoValidation.valid) return utxoValidation;

          // Check balance (exact fee validation happens in review modal via SDK)
          const totalBalance = confirmedUTXOs.reduce(
            (sum, utxo) => sum + BigInt(utxo.value),
            0n,
          );

          const balanceValidation = depositService.validateSufficientBalance(
            amount,
            totalBalance,
          );

          if (!balanceValidation.valid) return balanceValidation;

          // Combine warnings
          const warnings: string[] = [];
          if (utxoValidation.warnings) {
            warnings.push(...utxoValidation.warnings);
          }

          return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined,
          };
        }

        // If no UTXOs yet (wallet just connected), allow proceeding
        // Real validation will happen when transaction is built
        return {
          valid: true,
          warnings: [
            "UTXO validation will be performed during transaction creation",
          ],
        };
      } catch (error) {
        return {
          valid: false,
          error: formatErrorMessage(error),
        };
      }
    },
    [validateAmount, validateProviders, confirmedUTXOs],
  );

  return {
    validateAmount,
    validateProviders,
    validateDeposit,
    availableProviders: providers,
    minDeposit,
    maxDeposit: MAX_DEPOSIT_SATS,
    isLoadingParams,
    paramsError,
  };
}
