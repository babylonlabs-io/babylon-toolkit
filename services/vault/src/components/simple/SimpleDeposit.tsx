import { Heading } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";

import { ethClient } from "@/clients/eth-contract/client";
import { ApplicationLogo } from "@/components/ApplicationLogo";
import { isDepositBlocked } from "@/components/shared/protocolStatus";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { FeatureFlags } from "@/config";
import { getETHChain } from "@/config/network";
import { useAddressScreening } from "@/context/addressScreening";
import { useGeoFencing } from "@/context/geofencing";
import {
  ProtocolParamsProvider,
  useProtocolParamsContext,
} from "@/context/ProtocolParamsContext";
import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useBtcWalletState } from "@/hooks/deposit/useBtcWalletState";
import { useDepositPeginFee } from "@/hooks/deposit/useDepositPeginFee";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { usePendingVaultOverlapCheck } from "@/hooks/deposit/usePendingVaultOverlapCheck";
import { useBtcAction } from "@/hooks/useBtcAction";
import { useLiveVaultSlots } from "@/hooks/useLiveVaultSlots";
import { useProtocolFeeRows } from "@/hooks/useProtocolFeeRows";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { useVaultCountCap } from "@/hooks/useVaultCountCap";
import { depositService } from "@/services/deposit";
import { resolveFundingInputCap } from "@/services/deposit/fundingInputCap";
import {
  resolveDepositSplitUnavailableReason,
  resolveVaultCapState,
} from "@/services/deposit/vaultCap";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";
import { isDeviceDisconnectedError } from "@/utils/errors/deviceErrors";

import { DepositState, DepositStep } from "../../context/deposit/DepositState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";

import { DepositForm } from "./DepositForm";
import { DEPOSIT_VIEW_MAX_WIDTH_CLASS } from "./DepositProgressView/layout";
import { DepositSignContent } from "./DepositSignContent";
import { FadeTransition } from "./FadeTransition";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

// Resuming a deposit (Pre-PegIn broadcast, WOTS key, payout signing,
// activation) is owned by the deposit multistepper
// (PostDepositContinuationView). SimpleDeposit only handles the new-deposit flow.
type SimpleDepositProps = {
  open: boolean;
  onClose: () => void;
  /** Optional pre-filled BTC amount (e.g. from position notification suggestions) */
  initialAmountBtc?: string;
};

// ---------------------------------------------------------------------------
// New deposit flow content (form → sign → success)
// ---------------------------------------------------------------------------

function SimpleDepositContent({
  open,
  onClose,
  initialAmountBtc,
}: SimpleDepositProps) {
  const gate = useProtocolGateState();
  const { requireBtcWallet } = useBtcAction();
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const {
    isBlocked: isAddressBlocked,
    isUnavailable: isScreeningUnavailable,
    isLoading: isScreeningLoading,
  } = useAddressScreening();
  const { address: connectedEthAddress } = useETHWallet();
  const { chainId: walletChainId } = useAccount();
  const queryClient = useQueryClient();
  const {
    address: connectedBtcAddress,
    reconnect: reconnectBtcWallet,
    locked: isBtcWalletLocked,
  } = useBTCWallet();
  const btcConnector = useChainConnector("BTC");
  const { rows: feeRows, collateralFactor } =
    useProtocolFeeRows(connectedEthAddress);
  const [walletConnectionError, setWalletConnectionError] = useState<
    string | null
  >(null);
  const [isVerifyingWallet, setIsVerifyingWallet] = useState(false);
  const [isReconnectingWallet, setIsReconnectingWallet] = useState(false);

  const {
    depositStep,
    depositAmount,
    selectedApplication,
    selectedProviders,
    quotedCommissionBps,
    quotedPeginFeeWei,
    feeRate,
    btcWalletProvider,
    ethAddress,
    selectedProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    hasActiveVaults,
    isSplitDeposit,
    setIsSplitDeposit,
    splitVaultAmounts,
    setSplitVaultAmounts,
    resetDeposit,
    refetchActivities,
    goToStep,
    setDepositData,
    setFeeRate,
  } = useDepositPageFlow();

  const { config } = useProtocolParamsContext();
  const fundingInputCap = resolveFundingInputCap(config.maxFundingInputCount);

  // Per-position BTC Vault cap (on-chain). Always-on value-protection guard:
  // block the deposit when even a single vault won't fit (`isAtCap`), force a
  // single vault when a split would overflow (`isSplitUnavailable`), and fail
  // closed if the cap read errors (`vaultCountCapUnavailable`). The count comes
  // from `useVaultCountCap` (ACTIVE + PENDING + VERIFIED, adapter-scoped), which
  // keeps the in-flight margin so concurrent deposits can't slip past the cap
  // and be redeemed at activation. The deposit flow repeats the check from
  // chain before registration and before the broadcast.
  const {
    maxVaults,
    currentCount: collateralizableVaultCount,
    capUnavailable: vaultCountCapUnavailable,
  } = useVaultCountCap(connectedEthAddress);
  // Protocol-wide live-vault cap (CapPolicy): block the deposit, or force a
  // single vault, when the registration could not reserve a slot per vault.
  const liveVaultSlots = useLiveVaultSlots();
  const {
    isAtCap: isVaultCapReached,
    isLiveVaultCapReached,
    splitUnavailableReason,
  } = resolveVaultCapState({
    existingVaultCount: collateralizableVaultCount,
    maxVaultsPerPosition: maxVaults,
    enabled: true,
    maxHtlcOutputCount: config.maxHtlcOutputCount,
    liveVaultSlots,
  });

  const isSupplementalDeposit = !!initialAmountBtc;
  const suggestedAmountSats = initialAmountBtc
    ? depositService.parseBtcToSatoshis(initialAmountBtc)
    : null;
  // Whether this deposit would be offered a split at all: not a top-up from
  // the liquidation banner, and a fresh position unless the flag forces it.
  const isSplitOffered =
    !isSupplementalDeposit &&
    (!hasActiveVaults || FeatureFlags.isForcePartialLiquidationSplit);

  const isSplitPermitted = isSplitOffered && splitUnavailableReason === null;

  const {
    formData,
    setFormData,
    applyMaxAmount,
    effectiveSelectedApplication,
    isWalletConnected,
    canConnectBtcWallet,
    btcBalance,
    unconfirmedBalance,
    usableBtcPriceUsd,
    applications,
    providers,
    isLoadingProviders,
    amountSats,
    minDeposit,
    maxDeposit,
    estimatedFeeSats,
    estimatedFeeRate,
    isLoadingFee,
    feeError,
    maxDepositSats,
    fundingInputCapExceeded,
    effectiveRemaining,
    capUnavailable,
    minPeginFee,
    minPeginFeeError,
    appVersionUnsupported,
    p2aAnchorValueSats,
    isTwoVaultSplit,
    setIsTwoVaultSplit,
    canSplit,
    vaultAmounts,
    isSplitLoading,
    splitRatioLabel,
    minDepositForSplit,
    isSplitAmountTooLow,
    isSplitSizingRefused,
    isSplitParamsUnavailable,
    depositorClaimValue,
    depositorClaimValueError,
    btcPublicKeyError,
    refetchBtcPublicKey,
    ordinalsCheckPending,
    validateForm,
    resetForm,
  } = useDepositPageForm({ isSplitPermitted });

  // Live commission (bps) for the selected provider, read from the current
  // providers list. Captured into the deposit snapshot at commit time
  // (`handleDeposit`) so the value the signing flow binds is exactly what the
  // depositor reviewed — not a value a background refetch changed afterwards.
  // `undefined` while it loads or if the read failed.
  const selectedProviderCommissionBps = providers.find(
    (provider) => provider.id === formData.selectedProvider,
  )?.commissionBps;

  // The split sizing rules refusing the split is handled like a cap: the
  // deposit proceeds as a single vault and the form says why.
  const depositSplitUnavailableReason = resolveDepositSplitUnavailableReason({
    capReason: splitUnavailableReason,
    isSplitOffered,
    isVaultCapReached: isVaultCapReached || isLiveVaultCapReached,
    isSplitParamsUnavailable,
    isSplitSizingRefused,
  });
  const allowSplit = isSplitOffered && depositSplitUnavailableReason === null;

  // Effective split = the same condition handleDeposit uses at submit
  // (`shouldSplit`). Every batch-sized display row (protocol fee, total
  // claim reserve, commission) must match what will actually be submitted —
  // a stale split intent (below split minimum, split no longer allowed)
  // falls back to a single vault at submit.
  const isEffectiveSplit = isTwoVaultSplit && allowSplit && !!vaultAmounts;

  const depositBatchSize =
    isEffectiveSplit && vaultAmounts ? vaultAmounts.length : 1;

  const {
    feeWei: protocolFeeWei,
    isLoading: protocolFeeIsLoading,
    feeEthFormatted: protocolFeeAmount,
    feeUsdFormatted: protocolFeePrice,
    isError: protocolFeeIsError,
  } = useDepositPeginFee(
    formData.selectedProvider
      ? (formData.selectedProvider as Address)
      : undefined,
    depositBatchSize,
    amountSats,
  );
  const ethBalance = useQuery({
    queryKey: [
      "depositEthBalance",
      connectedEthAddress,
      getETHChain().id,
      walletChainId,
      formData.selectedProvider,
      depositBatchSize,
      amountSats.toString(),
    ],
    queryFn: () =>
      ethClient.getPublicClient().getBalance({
        address: connectedEthAddress as Address,
      }),
    enabled: open && !!connectedEthAddress && !!formData.selectedProvider,
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });
  const ethBalanceWei =
    typeof ethBalance.data === "bigint" && ethBalance.data >= 0n
      ? ethBalance.data
      : null;
  const ethBalanceMessage =
    !connectedEthAddress || !formData.selectedProvider
      ? null
      : protocolFeeIsLoading || ethBalance.isFetching
        ? COPY.deposit.form.ethBalanceChecking
        : protocolFeeIsError ||
            protocolFeeWei === null ||
            ethBalance.isError ||
            ethBalanceWei === null
          ? COPY.deposit.errors.ethBalanceUnavailable.body
          : ethBalanceWei <= protocolFeeWei
            ? COPY.deposit.errors.insufficientEthForGas.body
            : COPY.deposit.form.registrationGasCheckedLater;
  const ethBalanceBlocked =
    protocolFeeIsLoading ||
    ethBalance.isFetching ||
    protocolFeeWei === null ||
    ethBalanceWei === null ||
    protocolFeeIsError ||
    ethBalance.isError ||
    ethBalanceWei <= protocolFeeWei;

  const totalDepositorClaimValue =
    depositorClaimValue !== undefined
      ? depositorClaimValue * BigInt(depositBatchSize)
      : undefined;

  // Per-vault deposit amounts the protocol charges commission on
  // (btc-vault computes `floor(peginAmount × bps / 10000)` per payout —
  // claim value, PegIn fee, and the P2A anchor are NOT part of the basis).
  // Split deposits keep per-vault values distinct to preserve each floor.
  // isSplitPending = split intended and feasible but per-vault amounts not
  // yet resolved — the only state that shows the fee-line placeholder.
  const isSplitPending =
    isTwoVaultSplit && allowSplit && canSplit && !vaultAmounts;
  const commissionBaseValues =
    isEffectiveSplit && vaultAmounts
      ? vaultAmounts
      : isSplitPending
        ? undefined
        : [amountSats];

  // Auto-enable split once when it first becomes available and allowed
  const hasAutoChecked = useRef(false);
  useEffect(() => {
    if (canSplit && allowSplit && !hasAutoChecked.current) {
      hasAutoChecked.current = true;
      setIsTwoVaultSplit(true);
    }
  }, [canSplit, allowSplit, setIsTwoVaultSplit]);

  const twoVaultSplitProps = !allowSplit
    ? undefined
    : {
        // Show the split as selected only when the user wants it AND the
        // current amount can actually split. When the amount drops below the
        // splittable threshold the selector falls back to "Do not split";
        // raising it back above restores the selection because the underlying
        // intent is preserved. An explicit "Do not split" click (intent =
        // false) still sticks.
        isEnabled: isTwoVaultSplit && canSplit,
        onChange: setIsTwoVaultSplit,
        canSplit,
        isLoading: isSplitLoading,
        splitRatioLabel,
        minDepositForSplit,
        isSplitAmountTooLow,
      };

  // UTXO-overlap advisory: count is computed on click and rendered as a
  // non-blocking banner inside the deposit modal.
  const { spendableUTXOs, refetchUtxos } = useBtcWalletState();

  // Refetch UTXOs whenever the deposit dialog opens so the form (and the
  // SDK selector that runs at click time) sees post-broadcast state — the
  // React Query cache has a 30s staleTime and would otherwise serve stale
  // data after a prior deposit's Pre-PegIn broadcast.
  useEffect(() => {
    if (open) {
      void refetchUtxos();
    }
  }, [open, refetchUtxos]);
  const runOverlapCheck = usePendingVaultOverlapCheck({
    ethAddress: connectedEthAddress as Address | undefined,
    spendableUTXOs,
    estimatedFeeRate,
    depositorClaimValue,
    minPeginFee,
    maxFundingInputCount: fundingInputCap,
  });
  const [overlappingPendingVaultCount, setOverlappingPendingVaultCount] =
    useState<number | null | "unreadable">(null);

  const resetAll = useCallback(() => {
    hasAutoChecked.current = false;
    setIsTwoVaultSplit(false);
    setWalletConnectionError(null);
    setOverlappingPendingVaultCount(null);
    resetDeposit();
    resetForm();
  }, [setIsTwoVaultSplit, resetDeposit, resetForm]);

  // Freeze the rendered step during the close animation and reset on reopen
  const renderedStep = useDialogStep(open, depositStep, resetAll);

  const handleReconnectWallet = async () => {
    if (isReconnectingWallet) return;
    setIsReconnectingWallet(true);
    try {
      await reconnectBtcWallet();
      setWalletConnectionError(null);
      // reconnect() re-auths the raw provider without emitting a connector
      // event, so re-read the public key explicitly to clear a stuck
      // btcPublicKeyError once the wallet is unlocked again. Awaited so the
      // reconnecting state holds until the key is fresh — otherwise the CTA
      // briefly looks actionable while still showing the stale failure.
      await refetchBtcPublicKey();
    } catch {
      // The underlying provider throws dev-facing strings (e.g. "BTC wallet
      // provider returned an empty address"). Surface a single polished
      // message so users always see a consistent recovery instruction.
      setWalletConnectionError(
        "Could not reconnect your BTC wallet. Please open the wallet extension to confirm it is unlocked and authorized, then try again.",
      );
    } finally {
      setIsReconnectingWallet(false);
    }
  };

  const handleDeposit = async () => {
    // Kill-switch / pause guard on the submit path: blocks the deposit flow even
    // if a deposit entry point that bypasses the disabled buttons (e.g. the
    // Activity empty-state CTA or the urgent Add Collateral banner) opens this
    // dialog.
    if (isDepositBlocked(gate)) return;

    // Address-screening guard on the submit path, mirroring the kill-switch guard
    // above: the deposit entry points (Activity empty-state CTA, dashboard
    // Collateral "Deposit" button) don't hide for a screened wallet, so a blocked
    // address can open this dialog. The form CTA already disables ("Wallet not
    // eligible"), but block here too so no future entry point can slip a screened
    // wallet past. Fail closed while screening is still resolving.
    if (isAddressBlocked || isScreeningLoading) return;

    // Per-position BTC Vault cap: never start a deposit that would push the
    // position past the on-chain cap, or when the cap couldn't be read (fail
    // closed) — defense-in-depth behind the disabled CTA. The same for a
    // deposit the live-vault cap would revert.
    if (isVaultCapReached || vaultCountCapUnavailable || isLiveVaultCapReached)
      return;

    // The CTA doubles as the recovery action when the wallet-liveness probe
    // has failed OR the proactive lock poll has flagged a silently-locked
    // wallet: clicking it re-runs the underlying provider's connect flow
    // (which triggers the wallet's unlock/re-authorization prompt) instead of
    // attempting another deposit. The deposit attempt itself is only retried
    // once the user successfully reconnects and the error/lock state clears.
    // Runs before the Bitcoin prompt while a wallet is attached, so the form
    // keeps its own unlock state and an absent wallet still gets the prompt.
    if (
      isWalletConnected &&
      (walletConnectionError || isBtcWalletLocked || btcPublicKeyError)
    ) {
      await handleReconnectWallet();
      return;
    }
    if (!requireBtcWallet()) return;

    if (!validateForm() || ethBalanceBlocked) return;
    if (isVerifyingWallet) return;

    if (btcWalletProvider && connectedBtcAddress) {
      setIsVerifyingWallet(true);
      try {
        await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
          probeConnection: shouldProbeWalletLiveness(
            btcConnector?.connectedWallet?.id,
          ),
        });
      } catch (err) {
        setWalletConnectionError(
          isDeviceDisconnectedError(err)
            ? COPY.deposit.errors.deviceDisconnected.body
            : err instanceof Error
              ? err.message
              : COPY.wallet.liveness.checkFailed,
        );
        setIsVerifyingWallet(false);
        return;
      }
    } else {
      // The `!isWalletConnected` branch in getDepositCtaState should prevent
      // a click from reaching here without a provider + address, and the
      // defense-in-depth probe in useDepositFlow runs again at SIGN time.
      // Bail loudly if that contract is ever broken so we don't silently
      // skip the click-time liveness check.
      setWalletConnectionError(
        "BTC wallet is not connected. Please reconnect your wallet and try again.",
      );
      return;
    }

    setWalletConnectionError(null);

    // Keep the button in its loading state through the UTXO refetch so there's
    // no dead air between the wallet check and the signing screen.
    try {
      // Ensure the signing path sees post-mempool state, not the cached snapshot.
      await refetchUtxos();
    } finally {
      setIsVerifyingWallet(false);
    }

    const shouldSplit = isTwoVaultSplit && allowSplit && !!vaultAmounts;
    const effectiveVaultAmounts =
      shouldSplit && vaultAmounts ? [...vaultAmounts] : [amountSats];
    setOverlappingPendingVaultCount(runOverlapCheck(effectiveVaultAmounts));

    setDepositData(
      amountSats,
      effectiveSelectedApplication,
      [formData.selectedProvider],
      selectedProviderCommissionBps,
      protocolFeeWei,
    );
    setFeeRate(estimatedFeeRate);
    setIsSplitDeposit(shouldSplit);
    if (shouldSplit && vaultAmounts) {
      setSplitVaultAmounts([...vaultAmounts]);
    }
    // Wallet derives per-vault HTLC secrets via `expandHashlockSecret`
    // inside the SIGN step — no pre-sign secret step needed.
    goToStep(DepositStep.SIGN);
  };

  const showForm = !renderedStep || renderedStep === DepositStep.FORM;
  const headerApp = applications.find(
    (a) => a.id === effectiveSelectedApplication,
  );
  const stepKey = renderedStep ?? "form";

  return (
    <V3ModalShell open={open} onClose={onClose}>
      <FadeTransition stepKey={stepKey}>
        {showForm && (
          <div className="mx-auto w-full max-w-[564px]">
            {/* v3 puts the target application's logo in the header row
                instead of a separate app card inside the form. */}
            <div className="flex items-center justify-between gap-2">
              <Heading variant="h5">Deposit</Heading>
              {headerApp && (
                <ApplicationLogo
                  logoUrl={headerApp.logoUrl}
                  name={headerApp.name}
                  size="small"
                />
              )}
            </div>
            <div className="mt-4">
              <DepositForm
                amountState={{
                  amount: formData.amountBtc,
                  amountSats,
                  btcBalance,
                  unconfirmedBalance,
                  minDeposit,
                  maxDeposit,
                  maxDepositSats,
                  effectiveRemaining,
                  capUnavailable,
                  suggestedAmountSats,
                }}
                feeState={{
                  minPeginFee,
                  minPeginFeeError,
                  appVersionUnsupported,
                  p2aAnchorValueSats,
                  btcPriceUsd: usableBtcPriceUsd,
                  estimatedFeeSats,
                  estimatedFeeRate,
                  isLoadingFee,
                  feeError,
                  depositorClaimValue: totalDepositorClaimValue,
                  commissionBaseValues,
                  depositorClaimValueError,
                  protocolFeeWei,
                  protocolFeeAmount,
                  protocolFeePrice,
                  protocolFeeIsError,
                  ethBalanceBlocked,
                  ethBalanceMessage,
                  onRefreshEthBalance: () => {
                    void queryClient.invalidateQueries({
                      queryKey: ["depositPeginFee"],
                    });
                    void ethBalance.refetch();
                  },
                  feeRows,
                }}
                providerState={{
                  providers,
                  isLoadingProviders,
                  selectedProvider: formData.selectedProvider,
                  onProviderSelect: (providerId) =>
                    setFormData({ selectedProvider: providerId }),
                }}
                walletState={{
                  isWalletConnected,
                  canConnectBtcWallet,
                  // A click-time liveness failure OR the proactive lock poll
                  // promotes the CTA to the reconnect/unlock action. A lock
                  // relabels the CTA to "Unlock Wallet to Deposit" (see
                  // getDepositCtaState) instead of showing a red inline string; a
                  // liveness failure keeps its detail message.
                  hasWalletConnectionError:
                    Boolean(walletConnectionError) ||
                    isBtcWalletLocked ||
                    btcPublicKeyError !== null,
                  walletConnectionErrorMessage:
                    walletConnectionError ??
                    (btcPublicKeyError
                      ? COPY.wallet.publicKeyUnavailable
                      : null),
                  isWalletLocked: isBtcWalletLocked,
                  isVerifyingWallet,
                  isReconnectingWallet,
                }}
                gatingState={{
                  isDepositDisabled: isDepositBlocked(gate),
                  isGeoBlocked: isGeoBlocked || isGeoLoading,
                  isAddressBlocked: isAddressBlocked || isScreeningLoading,
                  isAddressScreeningUnavailable: isScreeningUnavailable,
                  ordinalsCheckPending,
                  isVaultCapReached,
                  vaultCountCapUnavailable,
                  isLiveVaultCapReached,
                  splitUnavailableReason: depositSplitUnavailableReason,
                  // Usage figures only make sense for the per-position cap; the
                  // protocol cap can bite with an empty position and an unknown
                  // per-position cap, so its hint quotes no numbers.
                  vaultCapUsage:
                    splitUnavailableReason === "per-position" &&
                    maxVaults != null
                      ? {
                          used: collateralizableVaultCount,
                          cap: maxVaults,
                        }
                      : undefined,
                }}
                collateralFactor={collateralFactor}
                twoVaultSplit={twoVaultSplitProps}
                fundingInputCapExceeded={fundingInputCapExceeded}
                maxFundingInputCount={fundingInputCap}
                onAmountChange={(value) => setFormData({ amountBtc: value })}
                onMaxClick={applyMaxAmount}
                onDeposit={handleDeposit}
              />
            </div>
          </div>
        )}

        {renderedStep === DepositStep.SIGN && btcWalletProvider && (
          <div className={`mx-auto w-full ${DEPOSIT_VIEW_MAX_WIDTH_CLASS}`}>
            <DepositSignContent
              vaultAmounts={
                isSplitDeposit && splitVaultAmounts
                  ? splitVaultAmounts
                  : [depositAmount]
              }
              depositAmountSats={depositAmount}
              mempoolFeeRate={feeRate}
              onFeeRateChange={setFeeRate}
              btcWalletProvider={btcWalletProvider}
              depositorEthAddress={ethAddress}
              selectedApplication={selectedApplication}
              selectedProviders={selectedProviders}
              quotedCommissionBps={quotedCommissionBps}
              quotedPeginFeeWei={quotedPeginFeeWei}
              vaultProviderBtcPubkey={selectedProviderBtcPubkey}
              vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
              universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
              overlappingPendingVaultCount={overlappingPendingVaultCount}
              onClose={onClose}
              onRefetchActivities={refetchActivities}
            />
          </div>
        )}
      </FadeTransition>
    </V3ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Public component — new deposit modal
// ---------------------------------------------------------------------------

export default function SimpleDeposit(props: SimpleDepositProps) {
  const { open, onClose } = props;

  return (
    <ProtocolParamsProvider requireUniversalChallengers>
      <DepositState>
        <SimpleDepositContent
          open={open}
          onClose={onClose}
          initialAmountBtc={props.initialAmountBtc}
        />
      </DepositState>
    </ProtocolParamsProvider>
  );
}
