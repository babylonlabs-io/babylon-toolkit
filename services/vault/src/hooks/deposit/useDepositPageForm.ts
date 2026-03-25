import {
  computeMinClaimValue,
  computeNumLocalChallengers,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";
import type { AllocationPlan } from "@/services/vault";

import { useProtocolParamsContext } from "../../context/ProtocolParamsContext";
import { useBTCWallet, useConnection } from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { formatProviderDisplayName } from "../../utils/formatting";
import { useApplications } from "../useApplications";
import { usePrice, usePrices } from "../usePrices";
import { calculateBalance, useUTXOs } from "../useUTXOs";

import { useAllocationPlanning } from "./useAllocationPlanning";
import { useDepositFormErrors } from "./useDepositFormErrors";
import { useDepositValidation } from "./useDepositValidation";
import { useEstimatedBtcFee } from "./useEstimatedBtcFee";
import { useVaultProviders } from "./useVaultProviders";

const STALE_TIME_MS = 5 * 60 * 1000;

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
  maxDeposit: bigint;

  estimatedFeeSats: bigint | null;
  estimatedFeeRate: number;
  isLoadingFee: boolean;
  feeError: string | null;
  maxDepositSats: bigint | null;

  // Partial liquidation (multi-vault)
  isPartialLiquidation: boolean;
  setIsPartialLiquidation: (v: boolean) => void;
  canSplit: boolean;
  strategy: AllocationPlan["strategy"] | null;
  allocationPlan: AllocationPlan | null;
  isPlanning: boolean;
  planError: string | null;
  /** Display label for the split ratio, null when not applicable */
  splitRatioLabel: string | null;
  /** Effective fee: multi-vault fee when checkbox is on, single-vault fee otherwise */
  effectiveFeeSats: bigint | null;

  /** Depositor claim value computed from WASM (VK/UC counts + fee). undefined while loading. */
  depositorClaimValue: bigint | undefined;

  validateForm: () => boolean;
  validateAmountOnBlur: () => void;
  resetForm: () => void;
}

export function useDepositPageForm(): UseDepositPageFormResult {
  const { address: btcAddress, connected: btcConnected } = useBTCWallet();
  const { isConnected: isWalletConnected } = useConnection();
  const depositorBtcPubkey = useBtcPublicKey(btcConnected);
  const { config, latestUniversalChallengers } = useProtocolParamsContext();
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
  const {
    vaultProviders: rawProviders,
    vaultKeepers,
    loading: isLoadingProviders,
  } = useVaultProviders(formData.selectedApplication || undefined);
  const providers = useMemo(() => {
    return rawProviders.map((p) => ({
      id: p.id,
      name: formatProviderDisplayName(p.name, p.id),
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

  // Derive selected VP's BTC pubkey and VK BTC pubkeys for challenger count
  const selectedVpBtcPubkey = useMemo(() => {
    const provider = providers.find((p) => p.id === formData.selectedProvider);
    return provider?.btcPubkey;
  }, [providers, formData.selectedProvider]);
  const vaultKeeperBtcPubkeys = useMemo(
    () => vaultKeepers.map((vk) => vk.btcPubKey),
    [vaultKeepers],
  );

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
    fee: estimatedFeeSats,
    feeRate: estimatedFeeRate,
    isLoading: isLoadingFee,
    error: feeError,
    maxDeposit: maxDepositSats,
  } = useEstimatedBtcFee(amountSats, spendableMempoolUTXOs);

  // Compute depositorClaimValue for UI validation (min deposit check).
  // Uses {VP} ∪ {VKs} − {depositor} which is >= the transaction builder's
  // vaultKeepers.length, making this a conservative estimate.
  const numLocalChallengers = useMemo(() => {
    if (!selectedVpBtcPubkey || !depositorBtcPubkey) return undefined;
    try {
      return computeNumLocalChallengers(
        selectedVpBtcPubkey,
        vaultKeeperBtcPubkeys,
        depositorBtcPubkey,
      );
    } catch {
      return undefined;
    }
  }, [selectedVpBtcPubkey, vaultKeeperBtcPubkeys, depositorBtcPubkey]);

  const { data: depositorClaimValue } = useQuery({
    queryKey: [
      "depositorClaimValue",
      numLocalChallengers,
      latestUniversalChallengers.length,
      config.offchainParams.councilQuorum,
      config.offchainParams.securityCouncilKeys.length,
      String(config.offchainParams.feeRate),
    ],
    queryFn: () =>
      computeMinClaimValue(
        numLocalChallengers!,
        latestUniversalChallengers.length,
        config.offchainParams.councilQuorum,
        config.offchainParams.securityCouncilKeys.length,
        config.offchainParams.feeRate,
      ),
    enabled:
      latestUniversalChallengers.length > 0 && numLocalChallengers != null,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  // Partial liquidation (multi-vault deposit)
  const [isPartialLiquidation, setIsPartialLiquidation] = useState(false);
  const hasAutoChecked = useRef(false);

  const {
    allocationPlan,
    strategy,
    totalFeeSats: multiVaultFeeSats,
    isPlanning,
    planError,
    canSplit,
    splitRatioLabel,
  } = useAllocationPlanning({
    amountSats,
    feeRate: estimatedFeeRate,
    isPartialLiquidation,
    spendableUTXOs,
    btcAddress,
    depositorClaimValue,
  });

  // Auto-check once when splitting first becomes possible
  useEffect(() => {
    if (canSplit && !hasAutoChecked.current) {
      hasAutoChecked.current = true;
      setIsPartialLiquidation(true);
    }
  }, [canSplit]);

  const effectiveFeeSats =
    isPartialLiquidation && multiVaultFeeSats != null
      ? multiVaultFeeSats
      : estimatedFeeSats;

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
      maxDeposit: validation.maxDeposit,
      btcBalance,
    });

    return (
      isWalletConnected &&
      hasAmount &&
      hasApplication &&
      hasProvider &&
      noErrors &&
      isAmountValid &&
      depositorClaimValue != null
    );
  }, [
    isWalletConnected,
    formData,
    errors,
    amountSats,
    validation.minDeposit,
    validation.maxDeposit,
    btcBalance,
    depositorClaimValue,
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
    maxDeposit: validation.maxDeposit,
    estimatedFeeSats,
    estimatedFeeRate,
    isLoadingFee,
    feeError,
    maxDepositSats,
    isPartialLiquidation,
    setIsPartialLiquidation,
    canSplit,
    strategy,
    depositorClaimValue,
    allocationPlan,
    isPlanning,
    planError,
    splitRatioLabel,
    effectiveFeeSats,
    validateForm,
    validateAmountOnBlur,
    resetForm,
  };
}
