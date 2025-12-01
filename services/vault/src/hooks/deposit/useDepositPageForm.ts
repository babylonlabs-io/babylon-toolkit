import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBTCWallet } from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { formatProviderName } from "../../utils/formatting";
import { useApplications } from "../useApplications";
import { useBTCPrice } from "../useBTCPrice";
import { calculateBalance, useUTXOs } from "../useUTXOs";

import { useDepositValidation } from "./useDepositValidation";
import { useVaultProviders } from "./useVaultProviders";

export interface DepositPageFormData {
  amountBtc: string;
  selectedApplication: string;
  selectedProvider: string;
}

export interface UseDepositPageFormResult {
  formData: DepositPageFormData;
  setFormData: (data: Partial<DepositPageFormData>) => void;

  errors: {
    amount?: string;
    application?: string;
    provider?: string;
  };
  isValid: boolean;

  btcBalance: bigint;
  btcBalanceFormatted: number;
  btcPrice: number;
  applications: Array<{
    id: string;
    name: string;
    type: string;
    logoUrl: string | null;
  }>;
  isLoadingApplications: boolean;
  providers: Array<{ id: string; name: string; btcPubkey: string }>;
  isLoadingProviders: boolean;

  amountSats: bigint;
  estimatedFees: {
    btcNetworkFee: bigint;
    protocolFee: bigint;
    totalFee: bigint;
  } | null;

  validateForm: () => boolean;
  resetForm: () => void;
}

export function useDepositPageForm(): UseDepositPageFormResult {
  const { address: btcAddress } = useBTCWallet();
  const { btcPriceUSD } = useBTCPrice();

  const [formData, setFormDataInternal] = useState<DepositPageFormData>({
    amountBtc: "",
    selectedApplication: "",
    selectedProvider: "",
  });

  // Track previous application to detect changes
  const prevApplicationRef = useRef<string>("");

  const { data: applicationsData, isLoading: isLoadingApplications } =
    useApplications();
  const applications = useMemo(() => {
    return (applicationsData || []).map((app) => ({
      id: app.id,
      name: app.name || app.type,
      type: app.type,
      logoUrl: app.logoUrl,
    }));
  }, [applicationsData]);

  // Fetch providers based on selected application
  const { vaultProviders: rawProviders, loading: isLoadingProviders } =
    useVaultProviders(formData.selectedApplication || undefined);
  const providers = useMemo(() => {
    return rawProviders.map((p: { id: string; btcPubKey: string }) => ({
      id: p.id,
      name: formatProviderName(p.id),
      btcPubkey: p.btcPubKey || "",
    }));
  }, [rawProviders]);

  // Reset provider selection when application changes
  useEffect(() => {
    const currentApp = formData.selectedApplication;
    const prevApp = prevApplicationRef.current;

    // Only reset if application actually changed (not on initial mount)
    if (prevApp && currentApp !== prevApp) {
      setFormDataInternal((prev) => ({
        ...prev,
        selectedProvider: "",
      }));
    }

    prevApplicationRef.current = currentApp;
  }, [formData.selectedApplication]);

  const providerIds = useMemo(
    () => providers.map((p: { id: string }) => p.id),
    [providers],
  );
  const validation = useDepositValidation(btcAddress, providerIds);

  const { confirmedUTXOs } = useUTXOs(btcAddress);
  const btcBalance = useMemo(() => {
    return BigInt(calculateBalance(confirmedUTXOs || []));
  }, [confirmedUTXOs]);

  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance, 8));
  }, [btcBalance]);

  const [errors, setErrors] = useState<{
    amount?: string;
    application?: string;
    provider?: string;
  }>({});

  const setFormData = useCallback((data: Partial<DepositPageFormData>) => {
    setFormDataInternal((prev) => ({
      ...prev,
      ...data,
    }));
    if (data.amountBtc !== undefined) {
      setErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { amount, ...rest } = prev;
        return rest;
      });
    }
    if (data.selectedApplication !== undefined) {
      setErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { application, ...rest } = prev;
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

  const amountSats = useMemo(() => {
    if (!formData.amountBtc) return 0n;
    return depositService.parseBtcToSatoshis(formData.amountBtc);
  }, [formData.amountBtc]);

  const estimatedFees = useMemo(() => {
    if (amountSats === 0n || !confirmedUTXOs || confirmedUTXOs.length === 0) {
      return null;
    }
    return depositService.calculateDepositFees(amountSats);
  }, [amountSats, confirmedUTXOs]);

  const validateForm = useCallback(() => {
    const newErrors: typeof errors = {};

    const amountResult = validation.validateAmount(formData.amountBtc);
    if (!amountResult.valid) {
      newErrors.amount = amountResult.error;
    }

    if (!formData.selectedApplication) {
      newErrors.application = "Please select an application";
    }

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

  const isValid = useMemo(() => {
    const hasAmount = formData.amountBtc !== "";
    const hasApplication = formData.selectedApplication !== "";
    const hasProvider = formData.selectedProvider !== "";
    const noErrors = Object.keys(errors).length === 0;
    const meetsMinimum = amountSats >= validation.minDeposit;
    return (
      hasAmount && hasApplication && hasProvider && noErrors && meetsMinimum
    );
  }, [formData, errors, amountSats, validation.minDeposit]);

  const resetForm = useCallback(() => {
    setFormDataInternal({
      amountBtc: "",
      selectedApplication: "",
      selectedProvider: "",
    });
    setErrors({});
  }, []);

  return {
    formData,
    setFormData,
    errors,
    isValid,
    btcBalance,
    btcBalanceFormatted,
    btcPrice: btcPriceUSD,
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    amountSats,
    estimatedFees,
    validateForm,
    resetForm,
  };
}
