import { useFormContext } from "@babylonlabs-io/core-ui";

import { CancelFeedbackModal } from "@/ui/common/components/Modals/CancelFeedbackModal";
import { SignModal } from "@/ui/common/components/Modals/SignModal/SignModal";
import { StakeModal } from "@/ui/common/components/Modals/StakeModal";
import { SuccessFeedbackModal } from "@/ui/common/components/Modals/SuccessFeedbackModal";
import { VerificationModal } from "@/ui/common/components/Modals/VerificationModal";
import { BaseStakingStep, EOIStep } from "@/ui/common/constants";
import { useNetworkInfo } from "@/ui/common/hooks/client/api/useNetworkInfo";
import { useStakingExpansionService } from "@/ui/common/hooks/services/useStakingExpansionService";
import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import { useStakingExpansionState } from "@/ui/common/state/StakingExpansionState";
import { StakingExpansionStep } from "@/ui/common/state/StakingExpansionTypes";
import { useAppState } from "@/ui/common/state";
import { validateDelegation } from "@/ui/common/utils/delegations";

import { SignDetailsModal } from "../Modals/SignDetailsModal";

import { RenewalPreviewModal } from "./RenewalPreviewModal";

const EOI_STEP_INDEXES: Record<string, number> = {
  [EOIStep.EOI_STAKING_SLASHING]: 1,
  [EOIStep.EOI_UNBONDING_SLASHING]: 2,
  [EOIStep.EOI_PROOF_OF_POSSESSION]: 3,
  [EOIStep.EOI_SIGN_BBN]: 4,
};

const VERIFICATION_STEP_INDEXES: Record<string, 1 | 2> = {
  [EOIStep.EOI_SEND_BBN]: 1,
  [BaseStakingStep.VERIFYING]: 2,
};

export function TimelockRenewalModalSystem() {
  const {
    processing,
    step,
    formData,
    verifiedDelegation,
    reset: resetState,
    expansionStepOptions,
  } = useStakingExpansionState();

  const { createExpansionEOI, stakeDelegationExpansion } =
    useStakingExpansionService();
  const { reset: resetForm, trigger: revalidateForm } = useFormContext() || {
    reset: () => {},
    trigger: () => {},
  };
  const { data: networkInfoData } = useNetworkInfo();
  const { availableUTXOs } = useAppState();

  const { delegationV2StepOptions, setDelegationV2StepOptions } =
    useDelegationV2State();
  const detailsModalTitle = "Timelock Renewal Transaction Details";

  // No data preparation needed for custom modal - it handles its own data

  const handleClose = () => {
    resetState();
    setDelegationV2StepOptions?.(undefined);
  };

  // Only render modals when step exists and formData indicates renewal
  if (!step) {
    return null;
  }

  return (
    <>
      {/* Step-based modals - only for renewal flow */}
      {/* Skip the custom renewal timelock modal; we go straight to Preview */}
      {step === StakingExpansionStep.PREVIEW &&
        formData &&
        formData.isRenewalOnly && (
          <RenewalPreviewModal
            open
            processing={processing}
            finalityProvider={formData.originalDelegation?.fp || null}
            stakingAmountSat={formData.originalDelegation?.stakingAmount || 0}
            stakingTimelock={formData.stakingTimelock}
            stakingFeeSat={formData.feeAmount || 0}
            feeRate={formData.feeRate}
            unbondingFeeSat={
              networkInfoData?.params.bbnStakingParams?.latestParam
                ?.unbondingFeeSat || 1000
            }
            onClose={handleClose}
            onProceed={async () => {
              await createExpansionEOI(formData);
              resetForm();
              revalidateForm();
            }}
          />
        )}
      {Boolean(EOI_STEP_INDEXES[step]) && (
        <SignModal
          open
          processing={processing}
          step={EOI_STEP_INDEXES[step]}
          title="Timelock Renewal"
          options={expansionStepOptions}
        />
      )}
      {Boolean(VERIFICATION_STEP_INDEXES[step]) && (
        <VerificationModal
          open
          processing={processing}
          step={VERIFICATION_STEP_INDEXES[step]}
        />
      )}
      {/* Show verified stake modal for renewals */}
      {verifiedDelegation && step === StakingExpansionStep.VERIFIED && (
        <StakeModal
          open={true}
          processing={processing}
          onSubmit={() => {
            // Validate UTXOs before proceeding
            const validation = validateDelegation(
              verifiedDelegation,
              availableUTXOs || [],
            );

            if (!validation.valid) {
              // The verified renewal has invalid UTXOs - show error and close
              alert(
                "This renewal transaction is no longer valid due to UTXO conflicts. Please refresh the page and create a new renewal.",
              );
              handleClose();
              return;
            }

            // UTXOs are valid, proceed with staking
            stakeDelegationExpansion(verifiedDelegation);
          }}
          onClose={handleClose}
        />
      )}
      <SuccessFeedbackModal
        open={step === StakingExpansionStep.FEEDBACK_SUCCESS}
        onClose={handleClose}
      />
      <CancelFeedbackModal
        open={step === StakingExpansionStep.FEEDBACK_CANCEL}
        onClose={handleClose}
      />
      <SignDetailsModal
        open={Boolean(delegationV2StepOptions) && processing}
        onClose={() => setDelegationV2StepOptions?.(undefined)}
        details={delegationV2StepOptions}
        title={detailsModalTitle}
      />
    </>
  );
}
