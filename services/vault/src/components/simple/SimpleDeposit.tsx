import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo } from "react";
import type { Hex } from "viem";

import { FeatureFlags } from "@/config";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { depositService } from "@/services/deposit";
import type { AllocationPlan } from "@/services/vault";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";

import {
  DepositPageStep,
  DepositState,
} from "../../context/deposit/DepositState";
import { VaultRedeemState } from "../../context/deposit/VaultRedeemState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import type { SplitTxSignResult } from "../../hooks/deposit/useMultiVaultDepositFlow";

import { DepositForm } from "./DepositForm";
import { DepositSignContent } from "./DepositSignContent";
import { DepositSuccessContent } from "./DepositSuccessContent";
import { FadeTransition } from "./FadeTransition";
import { MultiVaultDepositSignContent } from "./MultiVaultDepositSignContent";
import {
  ResumeBroadcastContent,
  ResumeSignContent,
} from "./ResumeDepositContent";
import { SplitChoiceContent } from "./SplitChoiceContent";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SimpleDepositBaseProps = {
  open: boolean;
  onClose: () => void;
};

type NewDepositProps = SimpleDepositBaseProps & {
  resumeMode?: undefined;
};

type ResumeSignProps = SimpleDepositBaseProps & {
  resumeMode: "sign_payouts";
  activity: VaultActivity;
  transactions: ClaimerTransactions[] | null;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onResumeSuccess: () => void;
};

type ResumeBroadcastProps = SimpleDepositBaseProps & {
  resumeMode: "broadcast_btc";
  activity: VaultActivity;
  depositorEthAddress: string;
  onResumeSuccess: () => void;
};

export type SimpleDepositProps =
  | NewDepositProps
  | ResumeSignProps
  | ResumeBroadcastProps;

// ---------------------------------------------------------------------------
// New deposit flow content (form → sign → success)
// ---------------------------------------------------------------------------

function SimpleDepositContent({ open, onClose }: SimpleDepositBaseProps) {
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();

  const {
    formData,
    setFormData,
    isValid,
    btcBalance,
    btcPrice,
    hasPriceFetchError,
    applications,
    providers,
    isLoadingProviders,
    amountSats,
    minDeposit,
    estimatedFeeSats,
    estimatedFeeRate,
    isLoadingFee,
    feeError,
    maxDepositSats,
    validateForm,
  } = useDepositPageForm();

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
    isSplitDeposit,
    setIsSplitDeposit,
    splitAllocationPlan,
    splitTxResult,
    setSplitAllocationPlan,
    setSplitTxResult,
    resetDeposit,
    refetchActivities,
    goToStep,
    setDepositData,
    setFeeRate,
    setTransactionHashes,
  } = useDepositPageFlow();

  // Freeze the rendered step during the close animation and reset on reopen
  const renderedStep = useDialogStep(open, depositStep, resetDeposit);

  const handleMaxClick = () => {
    if (maxDepositSats !== null && maxDepositSats > 0n) {
      const maxBtc = depositService.formatSatoshisToBtc(maxDepositSats);
      setFormData({ amountBtc: maxBtc });
    }
  };

  const handleDeposit = () => {
    if (validateForm()) {
      setDepositData(amountSats, formData.selectedApplication, [
        formData.selectedProvider,
      ]);
      setFeeRate(estimatedFeeRate);
      goToStep(DepositPageStep.SPLIT_CHOICE);
    }
  };

  // Compute vault amounts for the split flow (50/50 split)
  const vaultAmounts = useMemo(
    () => [depositAmount / 2n, depositAmount - depositAmount / 2n],
    [depositAmount],
  );

  const handleContinueSplit = useCallback(
    (plan: AllocationPlan, result: SplitTxSignResult | null) => {
      setSplitAllocationPlan(plan);
      setSplitTxResult(result);
      setIsSplitDeposit(true);
      goToStep(DepositPageStep.SIGN);
    },
    [setSplitAllocationPlan, setSplitTxResult, setIsSplitDeposit, goToStep],
  );

  const handleDoNotSplit = () => {
    setIsSplitDeposit(false);
    goToStep(DepositPageStep.SIGN);
  };

  const handleSignSuccess = useCallback(
    (btcTxid: string, ethTxHash: string, _depositorBtcPubkey: string) => {
      setTransactionHashes(btcTxid, ethTxHash, _depositorBtcPubkey);
      goToStep(DepositPageStep.SUCCESS);
    },
    [setTransactionHashes, goToStep],
  );

  const showForm = !renderedStep || renderedStep === DepositPageStep.FORM;
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
                minDeposit={minDeposit}
                btcPrice={btcPrice}
                hasPriceFetchError={hasPriceFetchError}
                onAmountChange={(value) => setFormData({ amountBtc: value })}
                onMaxClick={handleMaxClick}
                applications={applications}
                selectedApplication={formData.selectedApplication}
                providers={providers}
                isLoadingProviders={isLoadingProviders}
                selectedProvider={formData.selectedProvider}
                onProviderSelect={(providerId) =>
                  setFormData({ selectedProvider: providerId })
                }
                isValid={isValid}
                estimatedFeeSats={estimatedFeeSats}
                estimatedFeeRate={estimatedFeeRate}
                isLoadingFee={isLoadingFee}
                feeError={feeError}
                isDepositEnabled={FeatureFlags.isDepositEnabled}
                isGeoBlocked={isGeoBlocked || isGeoLoading}
                onDeposit={handleDeposit}
              />
            </div>
          </div>
        )}

        {renderedStep === DepositPageStep.SPLIT_CHOICE && (
          <div className="mx-auto w-full max-w-[520px]">
            <SplitChoiceContent
              vaultAmounts={vaultAmounts}
              feeRate={feeRate}
              btcWalletProvider={btcWalletProvider}
              depositorEthAddress={ethAddress}
              selectedProviders={selectedProviders}
              vaultProviderBtcPubkey={selectedProviderBtcPubkey}
              vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
              universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
              onContinueToSplit={handleContinueSplit}
              onDoNotSplit={handleDoNotSplit}
            />
          </div>
        )}

        {renderedStep === DepositPageStep.SIGN && (
          <div className="mx-auto w-full max-w-[520px]">
            {isSplitDeposit ? (
              <MultiVaultDepositSignContent
                vaultAmounts={vaultAmounts}
                feeRate={feeRate}
                btcWalletProvider={btcWalletProvider}
                depositorEthAddress={ethAddress}
                selectedApplication={selectedApplication}
                selectedProviders={selectedProviders}
                vaultProviderBtcPubkey={selectedProviderBtcPubkey}
                vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
                universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
                precomputedPlan={splitAllocationPlan ?? undefined}
                precomputedSplitTxResult={splitTxResult}
                onSuccess={handleSignSuccess}
                onClose={onClose}
                onRefetchActivities={refetchActivities}
              />
            ) : (
              <DepositSignContent
                amount={depositAmount}
                feeRate={feeRate}
                btcWalletProvider={btcWalletProvider}
                depositorEthAddress={ethAddress}
                selectedApplication={selectedApplication}
                selectedProviders={selectedProviders}
                vaultProviderBtcPubkey={selectedProviderBtcPubkey}
                vaultKeeperBtcPubkeys={vaultKeeperBtcPubkeys}
                universalChallengerBtcPubkeys={universalChallengerBtcPubkeys}
                onSuccess={handleSignSuccess}
                onClose={onClose}
                onRefetchActivities={refetchActivities}
              />
            )}
          </div>
        )}

        {renderedStep === DepositPageStep.SUCCESS && (
          <div className="mx-auto w-full max-w-[520px]">
            <DepositSuccessContent onClose={onClose} />
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
                transactions={props.transactions}
                btcPublicKey={props.btcPublicKey}
                depositorEthAddress={props.depositorEthAddress}
                onClose={onClose}
                onSuccess={props.onResumeSuccess}
              />
            ) : (
              <ResumeBroadcastContent
                activity={props.activity}
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
        <VaultRedeemState>
          <SimpleDepositContent open={open} onClose={onClose} />
        </VaultRedeemState>
      </DepositState>
    </ProtocolParamsProvider>
  );
}
