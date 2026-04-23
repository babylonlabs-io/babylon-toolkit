import {
  computeMinClaimValue,
  computeNumLocalChallengers,
  peginOutputCount,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";

import { useAaveConfig } from "../../applications/aave/context";
import { useProtocolParamsContext } from "../../context/ProtocolParamsContext";
import {
  useBTCWallet,
  useConnection,
  useETHWallet,
} from "../../context/wallet";
import { depositService } from "../../services/deposit";
import { formatProviderDisplayName } from "../../utils/formatting";
import { useApplicationCap } from "../useApplicationCap";
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
  selectedProvider: string;
}

export interface UseDepositPageFormResult {
  formData: DepositPageFormData;
  setFormData: (data: Partial<DepositPageFormData>) => void;
  /** Resolved application: user choice or auto-selected single app */
  effectiveSelectedApplication: string;

  errors: {
    amount?: string;
    application?: string;
    provider?: string;
  };
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

  /**
   * True when the ordinals check failed or timed out AND the user has
   * inscription-exclusion enabled. In that state, inscription UTXOs may be
   * spent unintentionally, so the UI should surface a warning.
   */
  ordinalsCheckUnavailable: boolean;

  /**
   * True when the ordinals check is still in flight AND the user has
   * inscription-exclusion enabled. Consumers should block submission until
   * the check resolves.
   */
  ordinalsCheckPending: boolean;

  // Partial liquidation (multi-vault)
  isPartialLiquidation: boolean;
  setIsPartialLiquidation: (v: boolean) => void;
  canSplit: boolean;
  /** Per-vault amounts when splitting, null when not applicable */
  vaultAmounts: readonly [bigint, bigint] | null;
  /** Whether split params are still loading */
  isSplitLoading: boolean;
  /** Display label for the split ratio, null when not applicable */
  splitRatioLabel: string | null;
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
  const { config: aaveConfig } = useAaveConfig();
  const btcPriceUSD = usePrice("BTC");
  const { metadata, hasStalePrices, hasPriceFetchError } = usePrices();

  const [formData, setFormDataInternal] = useState<DepositPageFormData>({
    amountBtc: "",
    selectedProvider: "",
  });

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

  // The application is always the Aave adapter — AaveConfigProvider blocks
  // rendering until loaded, so adapterAddress is available synchronously.
  const effectiveSelectedApplication = aaveConfig?.adapterAddress || "";

  // Fetch providers based on selected application
  const {
    vaultProviders: rawProviders,
    vaultKeepers,
    loading: isLoadingProviders,
  } = useVaultProviders(effectiveSelectedApplication || undefined);
  const providers = useMemo(() => {
    return rawProviders.map((p) => ({
      id: p.id,
      name: formatProviderDisplayName(p.name, p.id),
      btcPubkey: p.btcPubKey || "",
      iconUrl: p.iconUrl,
    }));
  }, [rawProviders]);

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
  const { address: ethAddress } = useETHWallet();
  const { snapshot: capSnapshot, error: capError } = useApplicationCap(
    isWalletConnected ? ethAddress : undefined,
  );
  // Only block validation when the on-chain cap read has explicitly errored.
  // During the initial load `capSnapshot` is null but `capError` is not set —
  // in that window the validator skips the cap check so the user can still
  // interact with the form. The contract still enforces the cap at submit.
  const validation = useDepositValidation({
    availableProviders: providerIds,
    effectiveRemaining: capSnapshot?.effectiveRemaining ?? null,
    capUnavailable: capError !== null,
  });

  // Get UTXOs for balance calculation (already respects inscription preference)
  const {
    spendableUTXOs,
    spendableMempoolUTXOs,
    ordinalsCheckUnavailable,
    ordinalsCheckPending,
  } = useUTXOs(btcAddress);
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

  // Partial liquidation (multi-vault deposit) — declared early so the fee
  // estimate below can account for the batch output count.
  const [isPartialLiquidation, setIsPartialLiquidation] = useState(false);

  // Batch-first: one Pre-PegIn tx with N HTLC outputs + 1 CPFP anchor.
  // When partial liquidation is on, N = 2 (sacrificial + protected vaults).
  const vaultCount = isPartialLiquidation ? 2 : 1;
  const numPeginOutputs = peginOutputCount(vaultCount);

  const {
    fee: estimatedFeeSats,
    feeRate: estimatedFeeRate,
    isLoading: isLoadingFee,
    error: feeError,
    maxDeposit: maxDepositSats,
  } = useEstimatedBtcFee(amountSats, spendableMempoolUTXOs, numPeginOutputs);

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

  const {
    vaultAmounts: splitVaultAmounts,
    canSplit,
    splitRatioLabel,
    isLoading: isSplitLoading,
  } = useAllocationPlanning({
    amountSats,
    isPartialLiquidation,
  });

  // Adjust max deposit to account for depositorClaimValue (network fees already subtracted)
  const adjustedMaxDepositSats = useMemo(() => {
    if (maxDepositSats == null || depositorClaimValue == null)
      return maxDepositSats;
    const adjusted = maxDepositSats - depositorClaimValue;
    return adjusted > 0n ? adjusted : 0n;
  }, [maxDepositSats, depositorClaimValue]);

  const validateForm = useCallback(() => {
    const newErrors: typeof errors = {};

    const amountResult = validation.validateAmount(formData.amountBtc);
    if (!amountResult.valid) {
      newErrors.amount = amountResult.error;
    }

    if (!effectiveSelectedApplication) {
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
  }, [formData, effectiveSelectedApplication, validation, setErrors]);

  const resetForm = useCallback(() => {
    setFormDataInternal({
      amountBtc: "",
      selectedProvider: "",
    });
    resetErrors();
  }, [resetErrors]);

  return {
    formData,
    setFormData,
    effectiveSelectedApplication,
    errors,
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
    maxDepositSats: adjustedMaxDepositSats,
    ordinalsCheckUnavailable,
    ordinalsCheckPending,
    isPartialLiquidation,
    setIsPartialLiquidation,
    canSplit,
    vaultAmounts: splitVaultAmounts,
    isSplitLoading,
    depositorClaimValue,
    splitRatioLabel,
    validateForm,
    validateAmountOnBlur,
    resetForm,
  };
}
