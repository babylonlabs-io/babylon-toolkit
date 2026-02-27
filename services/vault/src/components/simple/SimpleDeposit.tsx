import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
import type { Hex } from "viem";

import { FeatureFlags } from "@/config";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { depositService } from "@/services/deposit";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";
import type { VaultProvider } from "@/types/vaultProvider";

import { DepositState, DepositStep } from "../../context/deposit/DepositState";
import { VaultRedeemState } from "../../context/deposit/VaultRedeemState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { MnemonicModal } from "../deposit/MnemonicModal";

import { DepositForm } from "./DepositForm";
import { DepositSignContent } from "./DepositSignContent";
import { DepositSuccessContent } from "./DepositSuccessContent";
import { FadeTransition } from "./FadeTransition";
import {
  ResumeBroadcastContent,
  ResumeLamportContent,
  ResumeSignContent,
} from "./ResumeDepositContent";

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

type ResumeLamportProps = SimpleDepositBaseProps & {
  resumeMode: "submit_lamport_key";
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onResumeSuccess: () => void;
};

export type SimpleDepositProps =
  | NewDepositProps
  | ResumeSignProps
  | ResumeBroadcastProps
  | ResumeLamportProps;

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
    hasExistingVaults,
    confirmMnemonic,
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
      if (FeatureFlags.isDepositorAsClaimerEnabled) {
        goToStep(DepositStep.MNEMONIC);
      } else {
        goToStep(DepositStep.SIGN);
      }
    }
  };

  const handleSignSuccess = useCallback(
    (btcTxid: string, ethTxHash: string, _depositorBtcPubkey: string) => {
      setTransactionHashes(btcTxid, ethTxHash, _depositorBtcPubkey);
      goToStep(DepositStep.SUCCESS);
    },
    [setTransactionHashes, goToStep],
  );

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

        {renderedStep === DepositStep.MNEMONIC && (
          <MnemonicModal
            open
            onClose={onClose}
            onComplete={confirmMnemonic}
            hasExistingVaults={hasExistingVaults}
          />
        )}

        {renderedStep === DepositStep.SIGN && (
          <div className="mx-auto w-full max-w-[520px]">
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
          </div>
        )}

        {renderedStep === DepositStep.SUCCESS && (
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
    if (resumeMode === "submit_lamport_key") {
      return (
        <ProtocolParamsProvider>
          <ResumeLamportContent
            activity={props.activity}
            vaultProviders={props.vaultProviders}
            onClose={onClose}
            onSuccess={props.onResumeSuccess}
          />
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
