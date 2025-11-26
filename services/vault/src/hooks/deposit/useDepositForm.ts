/**
 * Deposit Form Hook
 *
 * Manages deposit form logic using the new architecture.
 * Used by DepositFormModal component.
 */

import { useCallback, useMemo, useState } from "react";

import { useVaultProviders } from "../../components/Overview/Deposits/hooks/useVaultProviders";
import { useBTCWallet } from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { calculateBalance, useUTXOs } from "../useUTXOs";

import { useDepositValidation } from "./useDepositValidation";

export interface DepositFormData {
  amountBtc: string;
  selectedProvider: string;
}

export interface UseDepositFormResult {
  // Form state
  formData: DepositFormData;
  setFormData: (data: Partial<DepositFormData>) => void;

  // Validation
  errors: {
    amount?: string;
    provider?: string;
  };
  isValid: boolean;

  // Data
  btcBalance: bigint;
  providers: Array<{ id: string; name: string; btcPubkey: string }>;
  isLoadingProviders: boolean;

  // Calculated values
  amountSats: bigint;
  estimatedFees: {
    btcNetworkFee: bigint;
    protocolFee: bigint;
    totalFee: bigint;
  } | null;

  // Actions
  validateForm: () => boolean;
  resetForm: () => void;
}

/**
 * Hook to manage deposit form state and validation
 */
export function useDepositForm(): UseDepositFormResult {
  const { address: btcAddress } = useBTCWallet();

  // Get providers
  const { vaultProviders, loading: isLoadingProviders } = useVaultProviders();

  // Transform providers for form
  const providers = useMemo(() => {
    return vaultProviders.map((p) => ({
      id: p.id,
      name: `Provider ${p.id.slice(0, 6)}...${p.id.slice(-4)}`,
      btcPubkey: p.btcPubKey || "",
    }));
  }, [vaultProviders]);

  // Get validation functions - pass provider IDs
  const providerIds = useMemo(() => providers.map((p) => p.id), [providers]);
  const validation = useDepositValidation(btcAddress, providerIds);

  // Get UTXOs for balance calculation
  const { confirmedUTXOs } = useUTXOs(btcAddress);
  const btcBalance = useMemo(() => {
    return BigInt(calculateBalance(confirmedUTXOs || []));
  }, [confirmedUTXOs]);

  // Form state
  const [formData, setFormDataInternal] = useState<DepositFormData>({
    amountBtc: "",
    selectedProvider: "",
  });

  const [errors, setErrors] = useState<{ amount?: string; provider?: string }>(
    {},
  );

  // Update form data
  const setFormData = useCallback((data: Partial<DepositFormData>) => {
    setFormDataInternal((prev) => ({
      ...prev,
      ...data,
    }));
    // Clear errors when user types
    if (data.amountBtc !== undefined) {
      setErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { amount, ...rest } = prev;
        return rest;
      });
    }
    if (data.selectedProvider !== undefined) {
      setErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { provider, ...rest } = prev;
        return rest;
      });
    }
  }, []);

  // Calculate amount in satoshis
  const amountSats = useMemo(() => {
    if (!formData.amountBtc) return 0n;
    return depositService.parseBtcToSatoshis(formData.amountBtc);
  }, [formData.amountBtc]);

  // Calculate estimated fees
  const estimatedFees = useMemo(() => {
    if (amountSats === 0n || !confirmedUTXOs || confirmedUTXOs.length === 0) {
      return null;
    }

    return depositService.calculateDepositFees(amountSats);
  }, [amountSats, confirmedUTXOs]);

  // Validate form
  const validateForm = useCallback(() => {
    const newErrors: typeof errors = {};

    // Validate amount
    const amountResult = validation.validateAmount(formData.amountBtc);
    if (!amountResult.valid) {
      newErrors.amount = amountResult.error;
    }

    // Validate provider
    if (!formData.selectedProvider) {
      newErrors.provider = "Please select a vault provider";
    } else {
      const providerResult = validation.validateProviders([
        formData.selectedProvider,
      ]);
      if (!providerResult.valid) {
        newErrors.provider = providerResult.error;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validation]);

  // Check if form is valid
  const isValid = useMemo(() => {
    const hasAmount = formData.amountBtc !== "";
    const hasProvider = formData.selectedProvider !== "";
    const noErrors = Object.keys(errors).length === 0;
    const result = hasAmount && hasProvider && noErrors;
    return result;
  }, [formData, errors]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormDataInternal({
      amountBtc: "",
      selectedProvider: "",
    });
    setErrors({});
  }, []);

  return {
    // Form state
    formData,
    setFormData,

    // Validation
    errors,
    isValid,

    // Data
    btcBalance,
    providers,
    isLoadingProviders,

    // Calculated values
    amountSats,
    estimatedFees,

    // Actions
    validateForm,
    resetForm,
  };
}
