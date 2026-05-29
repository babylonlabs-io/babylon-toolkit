import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import { FeatureFlags } from "@/config";
import { useAddressScreening } from "@/context/addressScreening";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useBtcWalletState } from "@/hooks/deposit/useBtcWalletState";
import { useDepositEthAffordability } from "@/hooks/deposit/useDepositEthAffordability";
import { useDepositPeginFee } from "@/hooks/deposit/useDepositPeginFee";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { usePendingVaultOverlapCheck } from "@/hooks/deposit/usePendingVaultOverlapCheck";
import { useProtocolFeeRows } from "@/hooks/useProtocolFeeRows";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
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
import {
  ResumeActivationContent,
  ResumeBroadcastContent,
  ResumeSignContent,
  ResumeWotsContent,
} from "./ResumeDepositContent";

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

type ResumeSignProps = SimpleDepositBaseProps & {
  resumeMode: "sign_payouts";
  activity: VaultActivity;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onResumeSuccess: () => void;
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

type ResumeWotsProps = SimpleDepositBaseProps & {
  resumeMode: "submit_wots_key";
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onResumeSuccess: () => void;
};

type ResumeActivationProps = SimpleDepositBaseProps & {
  resumeMode: "activate_vault";
  activity: VaultActivity;
  depositorEthAddress: string;
  onResumeSuccess: () => void;
};

export type SimpleDepositProps =
  | NewDepositProps
  | ResumeSignProps
  | ResumeBroadcastProps
  | ResumeWotsProps
  | ResumeActivationProps;

// ---------------------------------------------------------------------------
// New deposit flow content (form → sign → success)
// ---------------------------------------------------------------------------

function SimpleDepositContent({
  open,
  onClose,
  initialAmountBtc,
}: SimpleDepositBaseProps) {
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const { isBlocked: isAddressBlocked, isLoading: isScreeningLoading } =
    useAddressScreening();
  const { address: connectedEthAddress } = useETHWallet();
  const { address: connectedBtcAddress, reconnect: reconnectBtcWallet } =
    useBTCWallet();
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
    isPartialLiquidation,
    setIsPartialLiquidation,
    canSplit,
    vaultAmounts,
    isSplitLoading,
    splitRatioLabel,
    depositorClaimValue,
    ordinalsCheckPending,
    validateForm,
    resetForm,
  } = useDepositPageForm();

  const depositBatchSize =
    isPartialLiquidation && vaultAmounts ? vaultAmounts.length : 1;

  const {
    feeWei: peginFeeWei,
    feeEthFormatted: protocolFeeAmount,
    feeUsdFormatted: protocolFeePrice,
    isError: protocolFeeIsError,
  } = useDepositPeginFee(
    formData.selectedProvider
      ? (formData.selectedProvider as Address)
      : undefined,
    depositBatchSize,
  );

  // Pre-check that the connected ETH wallet can pay the registration tx
  // (pegin fee + gas) before the user commits. Fail-open: only block the CTA
  // when the wallet is definitively short; loading/errored reads leave
  // `hasEnough` null and the submit-time estimateGas stays authoritative.
  const { hasEnough: ethHasEnough } = useDepositEthAffordability({
    ethAddress: connectedEthAddress as Address | undefined,
    vaultProvider: formData.selectedProvider
      ? (formData.selectedProvider as Address)
      : undefined,
    batchSize: depositBatchSize,
    feeWei: peginFeeWei,
    // Gate on a positive amount too: the fee/gas reads don't depend on the
    // amount, but there's no point paying RPC before the user has entered a
    // fundable amount (and the BTC-side label wins below 0n regardless).
    enabled: isWalletConnected && amountSats > 0n,
  });
  const ethInsufficient = ethHasEnough === false;

  const totalDepositorClaimValue =
    depositorClaimValue !== undefined
      ? depositorClaimValue * BigInt(depositBatchSize)
      : undefined;

  const {
    depositStep,
    depositAmount,
    selectedApplication,
    selectedProviders,
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

  const isSupplementalDeposit = !!initialAmountBtc;
  const allowSplit =
    !isSupplementalDeposit &&
    (!hasActiveVaults || FeatureFlags.isForcePartialLiquidationSplit);

  // Auto-enable split once when it first becomes available and allowed
  const hasAutoChecked = useRef(false);
  useEffect(() => {
    if (canSplit && allowSplit && !hasAutoChecked.current) {
      hasAutoChecked.current = true;
      setIsPartialLiquidation(true);
    }
  }, [canSplit, allowSplit, setIsPartialLiquidation]);

  const partialLiquidationProps = !allowSplit
    ? undefined
    : {
        // Show the split as selected only when the user wants it AND the
        // current amount can actually split. When the amount drops below the
        // splittable threshold the selector falls back to "Do not split";
        // raising it back above restores the selection because the underlying
        // intent is preserved. An explicit "Do not split" click (intent =
        // false) still sticks.
        isEnabled: isPartialLiquidation && canSplit,
        onChange: setIsPartialLiquidation,
        canSplit,
        isLoading: isSplitLoading,
        splitRatioLabel,
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
    setIsPartialLiquidation(false);
    setWalletConnectionError(null);
    setOverlappingPendingVaultCount(null);
    resetDeposit();
    resetForm();
    // Re-apply the suggested amount for supplemental deposits opened from a
    // notification; plain opens start blank.
    if (initialAmountBtc) {
      setFormData({ amountBtc: initialAmountBtc });
    }
  }, [
    setIsPartialLiquidation,
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
    // The CTA doubles as the recovery action when the wallet-liveness probe
    // has failed: clicking it re-runs the underlying provider's connect flow
    // (which triggers the wallet's unlock/re-authorization prompt) instead of
    // attempting another deposit. The deposit attempt itself is only retried
    // once the user successfully reconnects and the error state clears.
    if (walletConnectionError) {
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
        return;
      } finally {
        setIsVerifyingWallet(false);
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

    // Ensure the signing path sees post-mempool state, not the cached snapshot.
    await refetchUtxos();

    const shouldSplit = isPartialLiquidation && allowSplit && !!vaultAmounts;
    const effectiveVaultAmounts =
      shouldSplit && vaultAmounts ? [...vaultAmounts] : [amountSats];
    setOverlappingPendingVaultCount(runOverlapCheck(effectiveVaultAmounts));

    setDepositData(amountSats, effectiveSelectedApplication, [
      formData.selectedProvider,
    ]);
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
          <div className="mx-auto w-full max-w-[520px]">
            <Heading variant="h5">Deposit</Heading>
            <div className="mt-4">
              <DepositForm
                amount={formData.amountBtc}
                amountSats={amountSats}
                btcBalance={btcBalance}
                unconfirmedBalance={unconfirmedBalance}
                hasUnconfirmedBalanceOnly={hasUnconfirmedBalanceOnly}
                minDeposit={minDeposit}
                maxDeposit={maxDeposit}
                maxDepositSats={maxDepositSats}
                effectiveRemaining={effectiveRemaining}
                capUnavailable={capUnavailable}
                minPeginFee={minPeginFee}
                minPeginFeeError={minPeginFeeError}
                btcPrice={btcPrice}
                hasPriceFetchError={hasPriceFetchError}
                onAmountChange={(value) => setFormData({ amountBtc: value })}
                onMaxClick={applyMaxAmount}
                applications={applications}
                selectedApplication={effectiveSelectedApplication}
                providers={providers}
                isLoadingProviders={isLoadingProviders}
                selectedProvider={formData.selectedProvider}
                onProviderSelect={(providerId) =>
                  setFormData({ selectedProvider: providerId })
                }
                isWalletConnected={isWalletConnected}
                depositorClaimValue={totalDepositorClaimValue}
                estimatedFeeSats={estimatedFeeSats}
                estimatedFeeRate={estimatedFeeRate}
                isLoadingFee={isLoadingFee}
                feeError={feeError}
                isDepositDisabled={FeatureFlags.isDepositDisabled}
                isGeoBlocked={isGeoBlocked || isGeoLoading}
                isAddressBlocked={isAddressBlocked || isScreeningLoading}
                onDeposit={handleDeposit}
                partialLiquidation={partialLiquidationProps}
                collateralFactor={collateralFactor}
                protocolFeeAmount={protocolFeeAmount}
                protocolFeePrice={protocolFeePrice}
                protocolFeeIsError={protocolFeeIsError}
                feeRows={feeRows}
                ordinalsCheckPending={ordinalsCheckPending}
                hasWalletConnectionError={Boolean(walletConnectionError)}
                walletConnectionErrorMessage={walletConnectionError}
                isVerifyingWallet={isVerifyingWallet}
                isReconnectingWallet={isReconnectingWallet}
                ethInsufficient={ethInsufficient}
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

  // Resume mode: skip form/state providers and render resume content directly
  if (resumeMode) {
    if (resumeMode === "submit_wots_key") {
      return (
        <ProtocolParamsProvider>
          <FullScreenDialog
            open={open}
            onClose={onClose}
            className="items-center justify-center p-6"
          >
            <div className="mx-auto w-full max-w-[520px]">
              <ResumeWotsContent
                activity={props.activity}
                onClose={onClose}
                onSuccess={props.onResumeSuccess}
              />
            </div>
          </FullScreenDialog>
        </ProtocolParamsProvider>
      );
    }

    if (resumeMode === "activate_vault") {
      return (
        <ProtocolParamsProvider>
          <FullScreenDialog
            open={open}
            onClose={onClose}
            className="items-center justify-center p-6"
          >
            <div className="mx-auto w-full max-w-[520px]">
              <ResumeActivationContent
                activity={props.activity}
                depositorEthAddress={props.depositorEthAddress}
                onClose={onClose}
                onSuccess={props.onResumeSuccess}
              />
            </div>
          </FullScreenDialog>
        </ProtocolParamsProvider>
      );
    }

    return (
      <ProtocolParamsProvider>
        <FullScreenDialog
          open={open}
          onClose={onClose}
          className="items-center justify-center p-6"
        >
          <div className="mx-auto w-full max-w-[520px]">
            {resumeMode === "sign_payouts" ? (
              <ResumeSignContent
                activity={props.activity}
                btcPublicKey={props.btcPublicKey}
                depositorEthAddress={props.depositorEthAddress}
                onClose={onClose}
                onSuccess={props.onResumeSuccess}
              />
            ) : (
              <ResumeBroadcastContent
                activity={props.activity}
                batchVaultIds={props.batchVaultIds}
                depositorEthAddress={props.depositorEthAddress}
                onClose={onClose}
                onSuccess={props.onResumeSuccess}
              />
            )}
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
