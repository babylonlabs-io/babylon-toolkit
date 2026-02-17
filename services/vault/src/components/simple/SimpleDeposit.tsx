import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

import { FeatureFlags } from "@/config";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";

import { DepositState, DepositStep } from "../../context/deposit/DepositState";
import { VaultRedeemState } from "../../context/deposit/VaultRedeemState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";

import { DepositForm } from "./DepositForm";
import { DepositSignContent } from "./DepositSignContent";
import { DepositSuccessContent } from "./DepositSuccessContent";
import { FadeTransition } from "./FadeTransition";
import { SplitVaultsContent } from "./SplitVaultsContent";

interface SimpleDepositProps {
  open: boolean;
  onClose: () => void;
}

function SimpleDepositContent({ open, onClose }: SimpleDepositProps) {
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const [defaultFeeRate] = useState(10); // TODO: real fee estimation

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
      goToStep(DepositStep.SPLIT_CONFIRM);
    }
  };

  const handleContinueSplit = useCallback(() => {
    setFeeRate(defaultFeeRate);
    goToStep(DepositStep.SIGN);
  }, [setFeeRate, defaultFeeRate, goToStep]);

  const handleDoNotSplit = useCallback(() => {
    setFeeRate(defaultFeeRate);
    goToStep(DepositStep.SIGN);
  }, [setFeeRate, defaultFeeRate, goToStep]);

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

        {renderedStep === DepositStep.SPLIT_CONFIRM && (
          <div className="mx-auto w-full max-w-[520px]">
            <SplitVaultsContent
              onContinueSplit={handleContinueSplit}
              onDoNotSplit={handleDoNotSplit}
            />
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

export default function SimpleDeposit({ open, onClose }: SimpleDepositProps) {
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
