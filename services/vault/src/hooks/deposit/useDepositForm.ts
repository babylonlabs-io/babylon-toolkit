/**
 * Deposit Form Hook
 *
 * Manages deposit form logic using the new architecture.
 * Used by DepositFormModal component.
 */

import { useCallback, useMemo, useState } from "react";

import { useBTCWallet } from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { formatProviderName } from "../../utils/formatting";
import { calculateBalance, useUTXOs } from "../useUTXOs";

import { useDepositValidation } from "./useDepositValidation";
import { useVaultProviders } from "./useVaultProviders";

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

  const providers = useMemo(() => {
    return vaultProviders.map((p) => ({
      id: p.id,
      name: formatProviderName(p.id),
      btcPubkey: p.btcPubKey || "",
    }));
  }, [vaultProviders]);

  // Get validation functions - pass provider IDs
  const providerIds = useMemo(() => providers.map((p) => p.id), [providers]);
  const { validateAmountWithBalance, validateProviders } =
    useDepositValidation(btcAddress, providerIds);

  // Get UTXOs for balance calculation (already respects inscription preference)
  const { spendableUTXOs } = useUTXOs(btcAddress);
  const btcBalance = useMemo(() => {
    return BigInt(calculateBalance(spendableUTXOs || []));
  }, [spendableUTXOs]);

  // Form state
  const [formData, setFormDataInternal] = useState<DepositFormData>({
    amountBtc: "",
    selectedProvider: "",
  });

  const [formErrors, setFormErrors] = useState<{
    amount?: string;
    provider?: string;
  }>({});

  // Update form data
  const setFormData = useCallback((data: Partial<DepositFormData>) => {
    setFormDataInternal((prev) => ({
      ...prev,
      ...data,
    }));
    if (data.amountBtc !== undefined) {
      setFormErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { amount, ...rest } = prev;
        return rest;
      });
    }
    if (data.selectedProvider !== undefined) {
      setFormErrors((prev) => {
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

  // Live amount error — reacts to amount/balance changes automatically
  const liveAmountError = useMemo(() => {
    if (!formData.amountBtc) return undefined;
    const result = validateAmountWithBalance(formData.amountBtc, btcBalance);
    return result.valid ? undefined : result.error;
  }, [formData.amountBtc, btcBalance, validateAmountWithBalance]);

  // Merge: manual errors take precedence, live error fills in when no manual error
  const errors = useMemo(() => {
    const merged = { ...formErrors };
    if (!merged.amount && liveAmountError) {
      merged.amount = liveAmountError;
    }
    return merged;
  }, [formErrors, liveAmountError]);

  // Validate form
  const validateForm = useCallback(() => {
    const newErrors: typeof formErrors = {};

    const amountResult = validateAmountWithBalance(
      formData.amountBtc,
      btcBalance,
    );
    if (!amountResult.valid) {
      newErrors.amount = amountResult.error;
    }

    // Validate provider
    if (!formData.selectedProvider) {
      newErrors.provider = "Please select a vault provider";
    } else {
      const providerResult = validateProviders([formData.selectedProvider]);
      if (!providerResult.valid) {
        newErrors.provider = providerResult.error;
      }
    }

    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validateAmountWithBalance, validateProviders, btcBalance]);

  // Check if form is valid
  const isValid = useMemo(() => {
    const hasAmount = formData.amountBtc !== "";
    const hasProvider = formData.selectedProvider !== "";
    const noErrors = Object.keys(errors).length === 0;

    return hasAmount && hasProvider && noErrors;
  }, [formData, errors]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormDataInternal({
      amountBtc: "",
      selectedProvider: "",
    });
    setFormErrors({});
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

    // Actions
    validateForm,
    resetForm,
  };
}
