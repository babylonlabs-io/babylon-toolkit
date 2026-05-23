import {
  computeMinClaimValue,
  computeMinPeginFee,
  computeNumLocalChallengers,
  peginOutputCount,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { vaultProviderUnavailableReason } from "../../utils/vaultProviderStatus";
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

/**
 * Per-batch reserve covering the CPFP anchor output value (~330 sats with
 * standard anchors, 0 with ephemeral) and a safety margin to absorb fee-rate
 * jitter between Max-click and Pre-PegIn broadcast.
 *
 * Sized for the 2-vault split case (~250 vbytes Pre-PegIn): after the ~330
 * sat CPFP value, ~2,670 sats remain — enough to absorb a ~10 sat/vB
 * upward mempool spike in the click→broadcast window. 1-vault batches get
 * more headroom by construction (smaller tx, same buffer).
 */
const PRE_PEGIN_SAFETY_BUFFER_SATS = 3_000n;

export interface DepositPageFormData {
  amountBtc: string;
  selectedProvider: string;
}

export interface UseDepositPageFormResult {
  formData: DepositPageFormData;
  setFormData: (data: Partial<DepositPageFormData>) => void;
  /**
   * Sets the amount to the current depositable maximum and pins it there: the
   * amount tracks `maxDepositSats` as it changes (e.g. when the UTXO split
   * auto-enables and lowers the max). Any manual amount edit unpins it.
   */
  applyMaxAmount: () => void;
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
    /** True when the provider's registered rpcUrl was rejected by the indexer. */
    unavailable?: boolean;
    /** Tooltip explaining why the provider is unavailable. */
    unavailableReason?: string;
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
   * Remaining application supply cap in satoshis. Null = no cap applies, or
   * the cap read is still loading. Surfaced so the CTA can mirror the same
   * cap-exceeded / cap-reached rejections that `validateForm` produces.
   */
  effectiveRemaining: bigint | null;
  /**
   * True when the supply-cap read errored. `validateForm` hard-rejects every
   * amount in this state; consumers must mirror that in the CTA.
   */
  capUnavailable: boolean;
  /**
   * Exact per-HTLC PegIn (activation) tx fee in satoshis from the WASM
   * `computeMinPeginFee` query. Null until vault keepers load and the WASM
   * query resolves. Consumers must gate the CTA on this so a user can't
   * submit during the loading window with an inflated Max value.
   */
  minPeginFee: bigint | null;
  /**
   * Terminal failure from the `computeMinPeginFee` WASM query (WASM init
   * failure, unsupported signer count, etc.). Surfaced separately from the
   * null `minPeginFee` "still loading" state so the CTA can show an error
   * instead of getting stuck on "Calculating fees...".
   */
  minPeginFeeError: Error | null;

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

  // True when the amount was set via the "Max" action. While pinned, the
  // amount follows the depositable maximum as it changes; a manual edit clears
  // the pin.
  const [isMaxPinned, setIsMaxPinned] = useState(false);

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
    return rawProviders.map((p) => {
      const unavailableReason = vaultProviderUnavailableReason(p);
      return {
        id: p.id,
        name: formatProviderDisplayName(p.name, p.id),
        btcPubkey: p.btcPubKey || "",
        iconUrl: p.iconUrl,
        unavailable: unavailableReason !== undefined,
        unavailableReason,
      };
    });
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

  // Display balance uses `availableUTXOs` so the user sees their real funds
  // even while the ordinals classifier is loading or has errored. Actual
  // spending uses `spendableMempoolUTXOs` (fee estimation) and the fail-closed
  // gate inside `useDepositFlow`, which refuses to submit while classification
  // is unavailable.
  const { availableUTXOs, spendableMempoolUTXOs, ordinalsCheckPending } =
    useUTXOs(btcAddress);
  const btcBalance = useMemo(() => {
    return BigInt(calculateBalance(availableUTXOs || []));
  }, [availableUTXOs]);

  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance));
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
      if (data.amountBtc !== undefined) {
        clearFieldError("amount");
        // A manual amount edit detaches the amount from the "Max" pin.
        setIsMaxPinned(false);
      }
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

  // Batch-first: one Pre-PegIn tx with N HTLC outputs + 1 CPFP anchor +
  // 1 OP_RETURN auth-anchor. When partial liquidation is on, N = 2.
  // `hasAuthAnchor: true` mirrors the OP_RETURN output that
  // `PeginManager.preparePegin` will include in its UTXO selection at
  // signing time, so the Max fee budget here matches the fee the UTXO
  // selector will later spend. No PSBT is built here — this is integer
  // vbyte budgeting only.
  const vaultCount = isPartialLiquidation ? 2 : 1;
  const numPeginOutputs = peginOutputCount(vaultCount, true);

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

  // Exact per-HTLC PegIn (activation) fee the depositor must reserve inside
  // each HTLC value. Sourced from the WASM (`compute_min_pegin_fee` in
  // btc-vault) so the displayed Max budgets the real
  //   minPeginFee = peginTxVsize(num_vks, num_ucs) × minPeginFeeRate
  // instead of an upper-bound flat constant. Application-scoped: depends on
  // VK + UC counts, not on which specific provider the user picks, so this
  // resolves as soon as `useVaultProviders` returns.
  //
  // We capture both `data` and `error` so the CTA can distinguish "still
  // loading" (data null, error null) from "terminal failure" (data null,
  // error set) — e.g. WASM init failure or unsupported signer counts. Without
  // the error surface the CTA gate would be stuck on "Calculating fees..."
  // with no recovery path.
  const { data: minPeginFee, error: minPeginFeeError } = useQuery({
    queryKey: [
      "minPeginFee",
      vaultKeeperBtcPubkeys.length,
      latestUniversalChallengers.length,
      String(config.offchainParams.minPeginFeeRate),
    ],
    queryFn: () =>
      computeMinPeginFee(
        vaultKeeperBtcPubkeys.length,
        latestUniversalChallengers.length,
        config.offchainParams.minPeginFeeRate,
      ),
    enabled: vaultKeeperBtcPubkeys.length > 0,
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

  // Adjust max deposit to reserve every per-HTLC and per-batch component that
  // the eventual Pre-PegIn tx will need to fund:
  //
  //   - Pre-PegIn network fee — already subtracted by computeMaxDeposit
  //   - Per-vault depositorClaimValue (depositor's recovery-path budget)
  //   - Per-vault minPeginFee (the VP's activation tx budget, reserved
  //     INSIDE each HTLC's value) — computed exactly via the WASM
  //     `computeMinPeginFee(num_vks, num_ucs, minPeginFeeRate)`
  //   - Per-batch CPFP anchor output value + safety margin
  //
  // Without the per-vault PegIn-fee reserve, Max could resolve to an amount
  // the iterative UTXO selector then rejects: the Pre-PegIn outputs sum to
  // vaultCount × (peginAmount + claimValue + minPeginFee) + CPFP, which
  // exceeds totalBalance once minPeginFee is non-zero.
  const adjustedMaxDepositSats = useMemo(() => {
    if (maxDepositSats == null) return null;
    const vaultCountBig = BigInt(vaultCount);
    // While the WASM queries are still loading, depositorClaimValue and
    // minPeginFee can be undefined. Defaulting them to 0n keeps the cap
    // clamp + flat batch buffer active so the Max button never shows a
    // value above the supply cap. When the queries resolve, adjusted may
    // shrink by the real claim + pegin-fee reserves; the isMaxPinned sync
    // effect auto-updates the form value.
    const claimReserve = (depositorClaimValue ?? 0n) * vaultCountBig;
    const peginFeeReserve = (minPeginFee ?? 0n) * vaultCountBig;
    const balanceBased =
      maxDepositSats -
      claimReserve -
      peginFeeReserve -
      PRE_PEGIN_SAFETY_BUFFER_SATS;
    // Clamp to the application's remaining supply cap when the cap is the
    // binding ceiling — otherwise the Max button can land the user above the
    // cap and `validateForm` would silently reject the click.
    const effectiveRemaining = capSnapshot?.effectiveRemaining ?? null;
    const adjusted =
      effectiveRemaining !== null && effectiveRemaining < balanceBased
        ? effectiveRemaining
        : balanceBased;
    return adjusted > 0n ? adjusted : 0n;
  }, [
    maxDepositSats,
    depositorClaimValue,
    minPeginFee,
    vaultCount,
    capSnapshot,
  ]);

  const applyMaxAmount = useCallback(() => {
    setIsMaxPinned(true);
    // A zero max is still a real value: the amount must reflect the cap (0)
    // rather than keep a stale positive value. Only `null` means "not yet
    // known", in which case the pin lets the sync effect fill it once loaded.
    if (adjustedMaxDepositSats != null) {
      setFormDataInternal((prev) => ({
        ...prev,
        amountBtc: depositService.formatSatoshisToBtc(adjustedMaxDepositSats),
      }));
      clearFieldError("amount");
    }
  }, [adjustedMaxDepositSats, clearFieldError]);

  // Keep a pinned "Max" amount in sync with the depositable maximum. The max
  // shifts after the form opens — most notably when the UTXO split
  // auto-enables and reserves a second vault's claim value — so a value
  // captured at click time would otherwise become unfundable. A max that
  // collapses to zero must also propagate, otherwise a stale positive amount
  // stays above the cap.
  useEffect(() => {
    if (!isMaxPinned) return;
    if (adjustedMaxDepositSats == null) return;
    const maxBtc = depositService.formatSatoshisToBtc(adjustedMaxDepositSats);
    setFormDataInternal((prev) =>
      prev.amountBtc === maxBtc ? prev : { ...prev, amountBtc: maxBtc },
    );
  }, [isMaxPinned, adjustedMaxDepositSats]);

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
    setIsMaxPinned(false);
    resetErrors();
  }, [resetErrors]);

  return {
    formData,
    setFormData,
    applyMaxAmount,
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
    effectiveRemaining: capSnapshot?.effectiveRemaining ?? null,
    capUnavailable: capError !== null,
    minPeginFee: minPeginFee ?? null,
    minPeginFeeError:
      minPeginFeeError instanceof Error ? minPeginFeeError : null,
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
