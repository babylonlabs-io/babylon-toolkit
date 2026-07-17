import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";

import { isDepositBlocked } from "@/components/shared/protocolStatus";
import { FeatureFlags } from "@/config";
import { useAddressScreening } from "@/context/addressScreening";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useBtcWalletState } from "@/hooks/deposit/useBtcWalletState";
import { useDepositPeginFee } from "@/hooks/deposit/useDepositPeginFee";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { usePendingVaultOverlapCheck } from "@/hooks/deposit/usePendingVaultOverlapCheck";
import { useProtocolFeeRows } from "@/hooks/useProtocolFeeRows";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { useVaultCountCap } from "@/hooks/useVaultCountCap";
import { depositService } from "@/services/deposit";
import { resolveVaultCapState } from "@/services/deposit/vaultCap";
import type { VaultActivity } from "@/types/activity";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";

import { DepositState, DepositStep } from "../../context/deposit/DepositState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";

import { DepositForm } from "./DepositForm";
import { DepositSignContent } from "./DepositSignContent";
import { FadeTransition } from "./FadeTransition";
import { ResumeBroadcastContent } from "./ResumeDepositContent";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SimpleDepositBaseProps = {
  open: boolean;
  onClose: () => void;
  /** Optional pre-filled BTC amount (e.g. from position notification suggestions) */
  initialAmountBtc?: string;
};

type NewDepositProps = SimpleDepositBaseProps & {
  resumeMode?: undefined;
};

type ResumeBroadcastProps = SimpleDepositBaseProps & {
  resumeMode: "broadcast_btc";
  activity: VaultActivity;
  /**
   * Every vault ID sharing this Pre-PegIn transaction (batched pegin).
   * Includes `activity.id`; a standalone deposit is a single-element list.
   * The broadcast confirms all of them.
   */
  batchVaultIds: string[];
  depositorEthAddress: string;
  onResumeSuccess: () => void;
};

// The post-broadcast resume actions (submit WOTS key, sign payouts, activate)
// are owned by the deposit multistepper (PostDepositContinuationView), which
// renders the Resume*Content components directly. SimpleDeposit only handles
// the new-deposit flow and the shared Pre-PegIn broadcast resume.
export type SimpleDepositProps = NewDepositProps | ResumeBroadcastProps;

// ---------------------------------------------------------------------------
// New deposit flow content (form → sign → success)
// ---------------------------------------------------------------------------

function SimpleDepositContent({
  open,
  onClose,
  initialAmountBtc,
}: SimpleDepositBaseProps) {
  const gate = useProtocolGateState();
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const { isBlocked: isAddressBlocked, isLoading: isScreeningLoading } =
    useAddressScreening();
  const { address: connectedEthAddress } = useETHWallet();
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
    formData,
    setFormData,
    applyMaxAmount,
    effectiveSelectedApplication,
    isWalletConnected,
    btcBalance,
    unconfirmedBalance,
    hasUnconfirmedBalanceOnly,
    btcPrice,
    hasPriceFetchError,
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
    depositorClaimValue,
    depositorClaimValueError,
    btcPublicKeyError,
    refetchBtcPublicKey,
    ordinalsCheckPending,
    validateForm,
    resetForm,
  } = useDepositPageForm();

  // Live commission (bps) for the selected provider, read from the current
  // providers list. Captured into the deposit snapshot at commit time
  // (`handleDeposit`) so the value the signing flow binds is exactly what the
  // depositor reviewed — not a value a background refetch changed afterwards.
  // `undefined` while it loads or if the read failed.
  const selectedProviderCommissionBps = providers.find(
    (provider) => provider.id === formData.selectedProvider,
  )?.commissionBps;

  const {
    depositStep,
    depositAmount,
    selectedApplication,
    selectedProviders,
    quotedCommissionBps,
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

  // Per-position BTC Vault cap (on-chain). Always-on value-protection guard:
  // block the deposit when even a single vault won't fit (`isAtCap`), force a
  // single vault when a split would overflow (`isSplitUnavailable`), and fail
  // closed if the cap read errors (`vaultCountCapUnavailable`). The count comes
  // from `useVaultCountCap` (ACTIVE + PENDING + VERIFIED, adapter-scoped), which
  // keeps the in-flight margin so concurrent deposits can't slip past the cap
  // and revert at activation.
  const {
    maxVaults,
    currentCount: collateralizableVaultCount,
    capUnavailable: vaultCountCapUnavailable,
  } = useVaultCountCap(connectedEthAddress);
  const { isAtCap: isVaultCapReached, isSplitUnavailable: isSplitCapReached } =
    resolveVaultCapState({
      existingVaultCount: collateralizableVaultCount,
      maxVaultsPerPosition: maxVaults,
      enabled: true,
    });

  const isSupplementalDeposit = !!initialAmountBtc;
  const suggestedAmountSats =
    initialAmountBtc && FeatureFlags.isV3UiEnabled
      ? depositService.parseBtcToSatoshis(initialAmountBtc)
      : null;
  const allowSplit =
    !isSupplementalDeposit &&
    !isSplitCapReached &&
    (!hasActiveVaults || FeatureFlags.isForcePartialLiquidationSplit);

  // Effective split = the same condition handleDeposit uses at submit
  // (`shouldSplit`). Every batch-sized display row (protocol fee, total
  // claim reserve, commission) must match what will actually be submitted —
  // a stale split intent (below split minimum, split no longer allowed)
  // falls back to a single vault at submit.
  const isEffectiveSplit = isTwoVaultSplit && allowSplit && !!vaultAmounts;

  const depositBatchSize =
    isEffectiveSplit && vaultAmounts ? vaultAmounts.length : 1;

  const {
    feeEthFormatted: protocolFeeAmount,
    feeUsdFormatted: protocolFeePrice,
    isError: protocolFeeIsError,
  } = useDepositPeginFee(
    formData.selectedProvider
      ? (formData.selectedProvider as Address)
      : undefined,
    depositBatchSize,
  );

  const totalDepositorClaimValue =
    depositorClaimValue !== undefined
      ? depositorClaimValue * BigInt(depositBatchSize)
      : undefined;

  // Per-vault deposit amounts the protocol charges commission on
  // (btc-vault computes `floor(peginAmount × bps / 10000)` per payout —
  // claim value, PegIn fee, and the P2A anchor are NOT part of the basis).
  // Split deposits keep per-vault values distinct to preserve each floor.
  // The undefined placeholder applies only while a feasible split's
  // amounts still load.
  const commissionBaseValues =
    isEffectiveSplit && vaultAmounts
      ? vaultAmounts
      : isTwoVaultSplit && allowSplit && canSplit
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
  });
  const [overlappingPendingVaultCount, setOverlappingPendingVaultCount] =
    useState<number | null>(null);

  const resetAll = useCallback(() => {
    hasAutoChecked.current = false;
    setIsTwoVaultSplit(false);
    setWalletConnectionError(null);
    setOverlappingPendingVaultCount(null);
    resetDeposit();
    resetForm();
    // v2 pre-fills the suggested amount for supplemental deposits opened from a
    // notification. v3 offers it via SuggestedDepositContainer instead so the
    // user selects it; plain opens start blank.
    if (initialAmountBtc && !FeatureFlags.isV3UiEnabled) {
      setFormData({ amountBtc: initialAmountBtc });
    }
  }, [
    setIsTwoVaultSplit,
    resetDeposit,
    resetForm,
    initialAmountBtc,
    setFormData,
  ]);

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
    // closed) — defense-in-depth behind the disabled CTA.
    if (isVaultCapReached || vaultCountCapUnavailable) return;

    // The CTA doubles as the recovery action when the wallet-liveness probe
    // has failed OR the proactive lock poll has flagged a silently-locked
    // wallet: clicking it re-runs the underlying provider's connect flow
    // (which triggers the wallet's unlock/re-authorization prompt) instead of
    // attempting another deposit. The deposit attempt itself is only retried
    // once the user successfully reconnects and the error/lock state clears.
    if (walletConnectionError || isBtcWalletLocked || btcPublicKeyError) {
      await handleReconnectWallet();
      return;
    }

    if (!validateForm()) return;
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
          err instanceof Error
            ? err.message
            : "BTC wallet check failed. Please reconnect your wallet and try again.",
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
  const stepKey = renderedStep ?? "form";

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <FadeTransition stepKey={stepKey}>
        {showForm && (
          <div className="mx-auto w-full max-w-[564px]">
            <Heading variant="h5">Deposit</Heading>
            <div className="mt-4">
              <DepositForm
                amountState={{
                  amount: formData.amountBtc,
                  amountSats,
                  btcBalance,
                  unconfirmedBalance,
                  hasUnconfirmedBalanceOnly,
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
                  btcPrice,
                  hasPriceFetchError,
                  estimatedFeeSats,
                  estimatedFeeRate,
                  isLoadingFee,
                  feeError,
                  depositorClaimValue: totalDepositorClaimValue,
                  commissionBaseValues,
                  depositorClaimValueError,
                  protocolFeeAmount,
                  protocolFeePrice,
                  protocolFeeIsError,
                  feeRows,
                }}
                providerState={{
                  applications,
                  selectedApplication: effectiveSelectedApplication,
                  providers,
                  isLoadingProviders,
                  selectedProvider: formData.selectedProvider,
                  onProviderSelect: (providerId) =>
                    setFormData({ selectedProvider: providerId }),
                }}
                walletState={{
                  isWalletConnected,
                  // A click-time liveness failure OR the proactive lock poll
                  // promotes the CTA to the reconnect/unlock action. A lock
                  // relabels the CTA to "Unlock wallet" (see DepositForm) instead
                  // of showing a red inline string; a liveness failure keeps its
                  // detail message.
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
                  ordinalsCheckPending,
                  isVaultCapReached,
                  vaultCountCapUnavailable,
                  vaultCapSplitUnavailable: isSplitCapReached,
                  vaultCapUsage:
                    isSplitCapReached && maxVaults != null
                      ? {
                          used: collateralizableVaultCount,
                          cap: maxVaults,
                        }
                      : undefined,
                }}
                collateralFactor={collateralFactor}
                twoVaultSplit={twoVaultSplitProps}
                onAmountChange={(value) => setFormData({ amountBtc: value })}
                onMaxClick={applyMaxAmount}
                onDeposit={handleDeposit}
              />
            </div>
          </div>
        )}

        {renderedStep === DepositStep.SIGN && btcWalletProvider && (
          <div className="mx-auto w-full max-w-[520px]">
            <DepositSignContent
              vaultAmounts={
                isSplitDeposit && splitVaultAmounts
                  ? splitVaultAmounts
                  : [depositAmount]
              }
              mempoolFeeRate={feeRate}
              btcWalletProvider={btcWalletProvider}
              depositorEthAddress={ethAddress}
              selectedApplication={selectedApplication}
              selectedProviders={selectedProviders}
              quotedCommissionBps={quotedCommissionBps}
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
    </FullScreenDialog>
  );
}

// ---------------------------------------------------------------------------
// Public component — single modal for new deposits and resume flows
// ---------------------------------------------------------------------------

export default function SimpleDeposit(props: SimpleDepositProps) {
  const { open, onClose, resumeMode } = props;

  // Resume mode: skip form/state providers and render the broadcast resume
  // content directly. (Other post-broadcast actions live in the multistepper.)
  if (resumeMode) {
    return (
      <ProtocolParamsProvider>
        <FullScreenDialog
          open={open}
          onClose={onClose}
          className="items-center justify-center p-6"
        >
          <div className="mx-auto w-full max-w-[520px]">
            <ResumeBroadcastContent
              activity={props.activity}
              batchVaultIds={props.batchVaultIds}
              depositorEthAddress={props.depositorEthAddress}
              onClose={onClose}
              onSuccess={props.onResumeSuccess}
            />
          </div>
        </FullScreenDialog>
      </ProtocolParamsProvider>
    );
  }

  // New deposit flow
  return (
    <ProtocolParamsProvider>
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
