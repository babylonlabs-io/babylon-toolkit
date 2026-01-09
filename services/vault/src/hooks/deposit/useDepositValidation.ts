/**
 * Deposit validation hook
 *
 * Handles all validation logic for deposits using pure service functions.
 * Integrates with wallet data and UTXO queries.
 */

import { useCallback, useMemo } from "react";

import type { DepositFormData, ValidationResult } from "../../services/deposit";
import { depositService } from "../../services/deposit";
import { formatErrorMessage } from "../../utils/errors";
import { getFeeRateFromMempool } from "../../utils/fee/getFeeRateFromMempool";
import { useNetworkFees } from "../useNetworkFees";
import { useUTXOs } from "../useUTXOs";

// Constants
const MAX_DEPOSIT_SATS = 21000000_00000000n; // 21M BTC (theoretical max)

export interface UseDepositValidationResult {
  // Validation functions
  validateAmount: (amount: string) => ValidationResult;
  validateProviders: (providers: string[]) => ValidationResult;
  validateDeposit: (data: DepositFormData) => Promise<ValidationResult>;

  // Available providers (passed in, not fetched)
  availableProviders: string[];

  // Validation state
  minDeposit: bigint;
  maxDeposit: bigint;
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

  // Get UTXOs for validation
  const { confirmedUTXOs } = useUTXOs(btcAddress, { enabled: !!btcAddress });

  // Get network fees
  const { data: networkFees } = useNetworkFees();
  const { defaultFeeRate } = getFeeRateFromMempool(networkFees);

  // Calculate dynamic minimum based on current fees
  const minDeposit = useMemo(() => {
    return depositService.calculateMinimumDeposit(defaultFeeRate);
  }, [defaultFeeRate]);

  // Validate amount
  const validateAmount = useCallback(
    (amount: string): ValidationResult => {
      try {
        const satoshis = depositService.parseBtcToSatoshis(amount);
        return depositService.validateDepositAmount(
          satoshis,
          minDeposit,
          MAX_DEPOSIT_SATS,
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
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
          const fees = depositService.calculateDepositFees(amount, defaultFeeRate);
          const requiredAmount = amount + fees.totalFee;

          const utxoValidation = depositService.validateUTXOs(
            confirmedUTXOs,
            requiredAmount,
          );

          if (!utxoValidation.valid) return utxoValidation;

          // Check balance
          const totalBalance = confirmedUTXOs.reduce(
            (sum, utxo) => sum + BigInt(utxo.value),
            0n,
          );

          const balanceValidation = depositService.validateSufficientBalance(
            requiredAmount,
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
    [validateAmount, validateProviders, confirmedUTXOs, defaultFeeRate],
  );

  return {
    validateAmount,
    validateProviders,
    validateDeposit,
    availableProviders: providers,
    minDeposit,
    maxDeposit: MAX_DEPOSIT_SATS,
  };
}
