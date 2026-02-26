import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";
import type { AllocationPlan, AllocationStrategy } from "@/services/vault";

import { useBTCWallet, useConnection } from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { formatProviderName } from "../../utils/formatting";
import { useApplications } from "../useApplications";
import { usePrice, usePrices } from "../usePrices";
import { calculateBalance, useUTXOs } from "../useUTXOs";

import { useAllocationPlanning } from "./useAllocationPlanning";
import { useDepositFormErrors } from "./useDepositFormErrors";
import { useDepositValidation } from "./useDepositValidation";
import { useEstimatedBtcFee } from "./useEstimatedBtcFee";
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
  priceMetadata: Record<string, PriceMetadata>;
  hasStalePrices: boolean;
  hasPriceFetchError: boolean;
  applications: Array<{
    id: string;
    name: string;
    type: string;
    logoUrl: string | null;
  }>;
  isLoadingApplications: boolean;
  providers: Array<{
    id: string;
    name: string;
    btcPubkey: string;
    iconUrl?: string;
  }>;
  isLoadingProviders: boolean;

  amountSats: bigint;
  minDeposit: bigint;

  estimatedFeeSats: bigint | null;
  estimatedFeeRate: number;
  isLoadingFee: boolean;
  feeError: string | null;
  maxDepositSats: bigint | null;

  // Partial liquidation
  isPartialLiquidation: boolean;
  setIsPartialLiquidation: (value: boolean) => void;
  allocationStrategy: AllocationStrategy | null;
  allocationPlan: AllocationPlan | null;
  isPlanning: boolean;
  canSplit: boolean;
  feeNote: string | null;

  validateForm: () => boolean;
  validateAmountOnBlur: () => void;
  resetForm: () => void;
}

export function useDepositPageForm(): UseDepositPageFormResult {
  const { address: btcAddress } = useBTCWallet();
  const { isConnected: isWalletConnected } = useConnection();
  const btcPriceUSD = usePrice("BTC");
  const { metadata, hasStalePrices, hasPriceFetchError } = usePrices();

  const [formData, setFormDataInternal] = useState<DepositPageFormData>({
    amountBtc: "",
    // Keep empty initially to avoid calling useVaultProviders with invalid value
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

  // Auto-select if only one application available
  useEffect(() => {
    if (!isLoadingApplications && applicationsData?.length === 1) {
      setFormDataInternal((prev) => ({
        ...prev,
        selectedApplication: applicationsData[0].id,
      }));
    }
  }, [isLoadingApplications, applicationsData]);

  // Fetch providers based on selected application
  const { vaultProviders: rawProviders, loading: isLoadingProviders } =
    useVaultProviders(formData.selectedApplication || undefined);
  const providers = useMemo(() => {
    return rawProviders.map((p) => ({
      id: p.id,
      name: p.name ?? formatProviderName(p.id),
      btcPubkey: p.btcPubKey || "",
      iconUrl: p.iconUrl,
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

  // Get UTXOs for balance calculation (already respects inscription preference)
  const { spendableUTXOs, spendableMempoolUTXOs } = useUTXOs(btcAddress);
  const btcBalance = useMemo(() => {
    return BigInt(calculateBalance(spendableUTXOs || []));
  }, [spendableUTXOs]);

  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance, 8));
  }, [btcBalance]);

  const { errors, setErrors, clearFieldError, resetErrors } =
    useDepositFormErrors();

  const setFormData = useCallback(
    (data: Partial<DepositPageFormData>) => {
      setFormDataInternal((prev) => ({
        ...prev,
        ...data,
      }));
      // Clear errors when user starts typing (they'll be validated on blur)
      if (data.amountBtc !== undefined) clearFieldError("amount");
      if (data.selectedApplication !== undefined)
        clearFieldError("application");
      if (data.selectedProvider !== undefined) clearFieldError("provider");
    },
    [clearFieldError],
  );

  // Validate amount on blur
  const validateAmountOnBlur = useCallback(() => {
    if (formData.amountBtc === "") return;
    const amountResult = validation.validateAmount(formData.amountBtc);
    if (!amountResult.valid) {
      setErrors((prev) => ({ ...prev, amount: amountResult.error }));
    }
  }, [formData.amountBtc, validation, setErrors]);

  const amountSats = useMemo(() => {
    if (!formData.amountBtc) return 0n;
    return depositService.parseBtcToSatoshis(formData.amountBtc);
  }, [formData.amountBtc]);

  const {
    fee: singleVaultFeeSats,
    feeRate: estimatedFeeRate,
    isLoading: isLoadingFee,
    error: feeError,
    maxDeposit: maxDepositSats,
  } = useEstimatedBtcFee(amountSats, spendableMempoolUTXOs);

  // Partial liquidation (allocation planning)
  const [isPartialLiquidation, setIsPartialLiquidation] = useState(false);
  const {
    strategy: allocationStrategy,
    allocationPlan,
    totalFee: multiVaultTotalFee,
    isPlanning,
    canSplit,
  } = useAllocationPlanning(amountSats);

  // Auto-check the checkbox when splitting becomes possible
  const prevCanSplitRef = useRef(false);
  useEffect(() => {
    if (canSplit && !prevCanSplitRef.current) {
      setIsPartialLiquidation(true);
    }
    if (!canSplit) {
      setIsPartialLiquidation(false);
    }
    prevCanSplitRef.current = canSplit;
  }, [canSplit]);

  // Use multi-vault fee when partial liquidation is active, otherwise single-vault fee
  const estimatedFeeSats =
    isPartialLiquidation && multiVaultTotalFee !== null
      ? multiVaultTotalFee
      : singleVaultFeeSats;

  // Fee note for the UI
  const feeNote = useMemo(() => {
    if (!isPartialLiquidation || !allocationStrategy) return null;
    if (allocationStrategy === "SPLIT") return "(includes split tx)";
    return null;
  }, [isPartialLiquidation, allocationStrategy]);

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
  }, [formData, validation, setErrors]);

  const isValid = useMemo(() => {
    const hasAmount = formData.amountBtc !== "";
    const hasApplication = formData.selectedApplication !== "";
    const hasProvider = formData.selectedProvider !== "";
    const noErrors = Object.keys(errors).length === 0;

    // Delegate amount validation to service layer
    const isAmountValid = depositService.isDepositAmountValid({
      amountSats,
      minDeposit: validation.minDeposit,
      btcBalance,
    });

    return (
      isWalletConnected &&
      hasAmount &&
      hasApplication &&
      hasProvider &&
      noErrors &&
      isAmountValid
    );
  }, [
    isWalletConnected,
    formData,
    errors,
    amountSats,
    validation.minDeposit,
    btcBalance,
  ]);

  const resetForm = useCallback(() => {
    setFormDataInternal({
      amountBtc: "",
      selectedApplication: "",
      selectedProvider: "",
    });
    resetErrors();
  }, [resetErrors]);

  return {
    formData,
    setFormData,
    errors,
    isValid,
    isWalletConnected,
    btcBalance,
    btcBalanceFormatted,
    btcPrice: btcPriceUSD,
    priceMetadata: metadata,
    hasStalePrices,
    hasPriceFetchError,
    applications,
    isLoadingApplications,
    providers,
    isLoadingProviders,
    amountSats,
    minDeposit: validation.minDeposit,
    estimatedFeeSats,
    estimatedFeeRate,
    isLoadingFee,
    feeError,
    maxDepositSats,
    isPartialLiquidation,
    setIsPartialLiquidation,
    allocationStrategy,
    allocationPlan,
    isPlanning,
    canSplit,
    feeNote,
    validateForm,
    validateAmountOnBlur,
    resetForm,
  };
}
