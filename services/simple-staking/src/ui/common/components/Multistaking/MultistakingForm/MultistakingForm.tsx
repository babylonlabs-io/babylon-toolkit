import { Form } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo } from "react";

import { useFormPersistenceState } from "@/ui/common/state/FormPersistenceState";
import {
  useMultistakingState,
  type MultistakingFormFields,
} from "@/ui/common/state/MultistakingState";
import { StakingStep, useStakingState } from "@/ui/common/state/StakingState";

import { MultistakingFormContent } from "./MultistakingFormContent";

export function MultistakingForm() {
  const { stakingInfo, setFormData, goToStep } = useStakingState();
  const { validationSchema } = useMultistakingState();
  const { btcStakeDraft, setBtcStakeDraft } = useFormPersistenceState();

  const defaultValues = useMemo<Partial<MultistakingFormFields>>(
    () => ({
      finalityProviders: btcStakeDraft?.finalityProviders,
      amount: btcStakeDraft?.amount,
      term: btcStakeDraft?.term ?? stakingInfo?.defaultStakingTimeBlocks,
      feeRate:
        btcStakeDraft?.feeRate ??
        (stakingInfo?.defaultFeeRate !== undefined
          ? stakingInfo.defaultFeeRate
          : 0),
      feeAmount: btcStakeDraft?.feeAmount,
    }),
    [
      btcStakeDraft,
      stakingInfo?.defaultStakingTimeBlocks,
      stakingInfo?.defaultFeeRate,
    ],
  );

  const handlePreview = useCallback(
    (formValues: Required<MultistakingFormFields>) => {
      setFormData({
        finalityProviders: Object.values(formValues.finalityProviders),
        term: formValues.term,
        amount: formValues.amount,
        feeRate: formValues.feeRate,
        feeAmount: formValues.feeAmount,
      });

      goToStep(StakingStep.PREVIEW);
    },
    [setFormData, goToStep],
  );

  if (!stakingInfo) {
    return null;
  }

  return (
    <Form
      schema={validationSchema}
      mode="onChange"
      reValidateMode="onChange"
      defaultValues={defaultValues}
      onChange={(data) => {
        const sanitizedFinalityProviders: Record<string, string> = {};

        Object.entries(data.finalityProviders ?? {}).forEach(([key, value]) => {
          if (typeof value === "string") {
            sanitizedFinalityProviders[key] = value;
          }
        });

        setBtcStakeDraft({
          ...data,
          finalityProviders: sanitizedFinalityProviders,
        });
      }}
      onSubmit={handlePreview}
    >
      <MultistakingFormContent />
    </Form>
  );
}
