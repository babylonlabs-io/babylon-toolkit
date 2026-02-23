import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
import type { Hex } from "viem";

import { FeatureFlags } from "@/config";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";

import { DepositState, DepositStep } from "../../context/deposit/DepositState";
import { VaultRedeemState } from "../../context/deposit/VaultRedeemState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";

import { DepositForm } from "./DepositForm";
import { DepositSignContent } from "./DepositSignContent";
import { DepositSuccessContent } from "./DepositSuccessContent";
import { FadeTransition } from "./FadeTransition";
import {
  ResumeBroadcastContent,
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

export type SimpleDepositProps =
  | NewDepositProps
  | ResumeSignProps
  | ResumeBroadcastProps;

// ---------------------------------------------------------------------------
// New deposit flow content (form → sign → success)
// ---------------------------------------------------------------------------

// Fallback fee rate in sats/vByte used until dynamic estimation is available.
const DEFAULT_FEE_RATE_SATS_PER_VBYTE = 10;

function SimpleDepositContent({ open, onClose }: SimpleDepositBaseProps) {
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();

  const {
    formData,
    setFormData,
    isValid,
    btcBalance,
    btcBalanceFormatted,
    btcPrice,
    hasPriceFetchError,
    applications,
    providers,
    isLoadingProviders,
    amountSats,
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
    if (btcBalanceFormatted > 0) {
      setFormData({ amountBtc: btcBalanceFormatted.toString() });
    }
  };

  const handleDeposit = () => {
    if (validateForm()) {
      setDepositData(amountSats, formData.selectedApplication, [
        formData.selectedProvider,
      ]);
      setFeeRate(DEFAULT_FEE_RATE_SATS_PER_VBYTE);
      goToStep(DepositStep.SIGN);
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
                btcBalance={btcBalance}
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
                isDepositEnabled={FeatureFlags.isDepositEnabled}
                isGeoBlocked={isGeoBlocked || isGeoLoading}
                onDeposit={handleDeposit}
              />
            </div>
          </div>
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
