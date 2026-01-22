import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAppIdByController } from "../../applications";
import { useBTCWallet, useConnection } from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { formatProviderName } from "../../utils/formatting";
import { useApplications } from "../useApplications";
import { usePrice } from "../usePrices";
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
  isWalletConnected: boolean;

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

  validateForm: () => boolean;
  resetForm: () => void;
}

export interface UseDepositPageFormOptions {
  initialApplicationId?: string;
}

export function useDepositPageForm(
  options: UseDepositPageFormOptions = {},
): UseDepositPageFormResult {
  const { initialApplicationId } = options;
  const { address: btcAddress } = useBTCWallet();
  const { isConnected: isWalletConnected } = useConnection();
  const btcPriceUSD = usePrice("BTC");

  const [formData, setFormDataInternal] = useState<DepositPageFormData>({
    amountBtc: "",
    selectedApplication: initialApplicationId || "",
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

  const hasResolvedInitialApp = useRef(false);
  useEffect(() => {
    if (
      !initialApplicationId ||
      isLoadingApplications ||
      !applicationsData?.length ||
      hasResolvedInitialApp.current
    ) {
      return;
    }

    // Check if initialApplicationId is already a valid controller address
    const directMatch = applicationsData.find(
      (app) => app.id === initialApplicationId,
    );
    if (directMatch) {
      hasResolvedInitialApp.current = true;
      return;
    }

    const matchingApp = applicationsData.find(
      (app) => getAppIdByController(app.id) === initialApplicationId,
    );
    if (matchingApp) {
      hasResolvedInitialApp.current = true;
      setFormDataInternal((prev) => ({
        ...prev,
        selectedApplication: matchingApp.id,
      }));
    }
  }, [initialApplicationId, applicationsData, isLoadingApplications]);

  // Fetch providers based on selected application
  const { vaultProviders: rawProviders, loading: isLoadingProviders } =
    useVaultProviders(formData.selectedApplication || undefined);
  const providers = useMemo(() => {
    return rawProviders.map((p) => ({
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
      isWalletConnected &&
      hasAmount &&
      hasApplication &&
      hasProvider &&
      noErrors &&
      meetsMinimum
    );
  }, [isWalletConnected, formData, errors, amountSats, validation.minDeposit]);

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
    isWalletConnected,
    btcBalance,
    btcBalanceFormatted,
    btcPrice: btcPriceUSD,
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    amountSats,
    validateForm,
    resetForm,
  };
}
