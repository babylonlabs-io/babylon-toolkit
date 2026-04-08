import { FullScreenDialog, Heading } from "@babylonlabs-io/core-ui";
import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";

import type { DepositorGraphTransactions } from "@/clients/vault-provider-rpc/types";
import { FeatureFlags } from "@/config";
import { useGeoFencing } from "@/context/geofencing";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { depositService } from "@/services/deposit";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";
import type { VaultProvider } from "@/types/vaultProvider";
import { generateSecretHex } from "@/utils/secretUtils";

import {
  DepositState,
  DepositStep,
  useDepositState,
} from "../../context/deposit/DepositState";
import { useDepositPageFlow } from "../../hooks/deposit/useDepositPageFlow";
import { useDepositPageForm } from "../../hooks/deposit/useDepositPageForm";
import { DepositSecretModal } from "../deposit/DepositSecretModal";
import { MnemonicModal } from "../deposit/MnemonicModal";

import { DepositForm } from "./DepositForm";
import { DepositSignContent } from "./DepositSignContent";
import { DepositSuccessContent } from "./DepositSuccessContent";
import { FadeTransition } from "./FadeTransition";
import {
  ResumeActivationContent,
  ResumeBroadcastContent,
  ResumeRefundContent,
  ResumeSignContent,
  ResumeWotsContent,
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
  depositorGraph: DepositorGraphTransactions;
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

type ResumeRefundProps = SimpleDepositBaseProps & {
  resumeMode: "refund_htlc";
  activity: VaultActivity;
  onResumeSuccess: () => void;
};

export type SimpleDepositProps =
  | NewDepositProps
  | ResumeSignProps
  | ResumeBroadcastProps
  | ResumeWotsProps
  | ResumeActivationProps
  | ResumeRefundProps;

// ---------------------------------------------------------------------------
// New deposit flow content (form → sign → success)
// ---------------------------------------------------------------------------

function SimpleDepositContent({ open, onClose }: SimpleDepositBaseProps) {
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();

  const {
    formData,
    setFormData,
    effectiveSelectedApplication,
    isWalletConnected,
    btcBalance,
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
    isPartialLiquidation,
    setIsPartialLiquidation,
    canSplit,
    strategy,
    allocationPlan,
    isPlanning,
    splitRatioLabel,
    depositorClaimValue,
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
    hasActiveVaults,
    isSplitDeposit,
    setIsSplitDeposit,
    splitAllocationPlan,
    setSplitAllocationPlan,
    confirmMnemonic,
    getMnemonic,
    mnemonicId,
    resetDeposit,
    refetchActivities,
    goToStep,
    setDepositData,
    setFeeRate,
    setTransactionHashes,
  } = useDepositPageFlow();

  const { setSecretHashes, secretHashes } = useDepositState();

  // Per-vault secrets generated when the SECRET step is entered.
  // Using a ref (not state) avoids re-renders and keeps sensitive data
  // out of React DevTools.
  const secretHexesRef = useRef<string[]>([]);
  const [secretVaultIndex, setSecretVaultIndex] = useState(0);

  const handleMnemonicComplete = useCallback(
    (mnemonic?: string, mnemonicId?: string) => {
      confirmMnemonic(mnemonic, mnemonicId);
      // Always generate secrets — the pegin flow requires an HTLC preimage.
      // The feature flag only controls whether the user sees the secret modal.
      const vaultCount =
        isSplitDeposit && splitAllocationPlan
          ? splitAllocationPlan.vaultAllocations.length
          : 1;
      secretHexesRef.current = Array.from({ length: vaultCount }, () =>
        generateSecretHex(),
      );
      setSecretVaultIndex(0);
      goToStep(DepositStep.SECRET);
    },
    [confirmMnemonic, goToStep, isSplitDeposit, splitAllocationPlan],
  );

  const allowSplit =
    !hasActiveVaults || FeatureFlags.isForcePartialLiquidationSplit;

  const partialLiquidationProps = !allowSplit
    ? undefined
    : {
        isEnabled: isPartialLiquidation,
        onChange: setIsPartialLiquidation,
        canSplit,
        strategy,
        isPlanning,
        splitRatioLabel,
      };

  const resetAll = useCallback(() => {
    secretHexesRef.current = [];
    setSecretVaultIndex(0);
    resetDeposit();
  }, [resetDeposit]);

  // Freeze the rendered step during the close animation and reset on reopen
  const renderedStep = useDialogStep(open, depositStep, resetAll);

  const handleMaxClick = () => {
    if (maxDepositSats !== null && maxDepositSats > 0n) {
      const maxBtc = depositService.formatSatoshisToBtc(maxDepositSats);
      setFormData({ amountBtc: maxBtc });
    }
  };

  const handleDeposit = () => {
    if (validateForm()) {
      setDepositData(amountSats, effectiveSelectedApplication, [
        formData.selectedProvider,
      ]);
      setFeeRate(estimatedFeeRate);
      const shouldSplit =
        isPartialLiquidation && allowSplit && !!allocationPlan;
      setIsSplitDeposit(shouldSplit);
      if (shouldSplit && allocationPlan) {
        setSplitAllocationPlan(allocationPlan);
      }
      goToStep(DepositStep.MNEMONIC);
    }
  };

  const handleSignSuccess = useCallback(
    (peginTxHash: string, ethTxHash: string, _depositorBtcPubkey: string) => {
      setTransactionHashes(peginTxHash, ethTxHash, _depositorBtcPubkey);
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
                maxDeposit={maxDeposit}
                btcPrice={btcPrice}
                hasPriceFetchError={hasPriceFetchError}
                onAmountChange={(value) => setFormData({ amountBtc: value })}
                onMaxClick={handleMaxClick}
                applications={applications}
                selectedApplication={effectiveSelectedApplication}
                providers={providers}
                isLoadingProviders={isLoadingProviders}
                selectedProvider={formData.selectedProvider}
                onProviderSelect={(providerId) =>
                  setFormData({ selectedProvider: providerId })
                }
                isWalletConnected={isWalletConnected}
                depositorClaimValue={depositorClaimValue}
                estimatedFeeSats={estimatedFeeSats}
                estimatedFeeRate={estimatedFeeRate}
                isLoadingFee={isLoadingFee}
                feeError={feeError}
                isDepositDisabled={FeatureFlags.isDepositDisabled}
                isGeoBlocked={isGeoBlocked || isGeoLoading}
                onDeposit={handleDeposit}
                partialLiquidation={partialLiquidationProps}
              />
            </div>
          </div>
        )}

        {renderedStep === DepositStep.MNEMONIC && (
          <MnemonicModal
            open
            onClose={onClose}
            onComplete={handleMnemonicComplete}
            hasExistingVaults={hasExistingVaults}
            scope={ethAddress}
          />
        )}

        {renderedStep === DepositStep.SECRET &&
          secretHexesRef.current.length > 0 && (
            <DepositSecretModal
              key={secretVaultIndex}
              open
              onClose={onClose}
              secretHex={secretHexesRef.current[secretVaultIndex]}
              vaultLabel={
                secretHexesRef.current.length > 1
                  ? `Vault ${secretVaultIndex + 1} of ${secretHexesRef.current.length}`
                  : undefined
              }
              onComplete={(_secretHex, hash) => {
                const updated = [...secretHashes, hash];
                if (secretVaultIndex + 1 < secretHexesRef.current.length) {
                  setSecretHashes(updated);
                  setSecretVaultIndex((i) => i + 1);
                } else {
                  setSecretHashes(updated);
                  goToStep(DepositStep.SIGN);
                }
              }}
            />
          )}

        {renderedStep === DepositStep.SIGN &&
          getMnemonic &&
          btcWalletProvider && (
            <div className="mx-auto w-full max-w-[520px]">
              <DepositSignContent
                vaultAmounts={
                  isSplitDeposit && splitAllocationPlan
                    ? splitAllocationPlan.vaultAllocations.map((a) => a.amount)
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
                getMnemonic={getMnemonic}
                mnemonicId={mnemonicId}
                htlcSecretHexes={secretHexesRef.current}
                depositorSecretHashes={secretHashes}
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

    if (resumeMode === "refund_htlc") {
      return (
        <FullScreenDialog
          open={open}
          onClose={onClose}
          className="items-center justify-center p-6"
        >
          <div className="mx-auto w-full max-w-[520px]">
            <ResumeRefundContent
              activity={props.activity}
              onClose={onClose}
              onSuccess={props.onResumeSuccess}
            />
          </div>
        </FullScreenDialog>
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
                depositorGraph={props.depositorGraph}
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
        <SimpleDepositContent open={open} onClose={onClose} />
      </DepositState>
    </ProtocolParamsProvider>
  );
}
