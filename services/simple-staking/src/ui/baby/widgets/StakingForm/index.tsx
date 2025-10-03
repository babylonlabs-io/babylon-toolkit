import { Form, type FormRef } from "@babylonlabs-io/core-ui";
import { useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { DeepPartial } from "react-hook-form";

import { AmountField } from "@/ui/baby/components/AmountField";
import { FeeField } from "@/ui/baby/components/FeeField";
import { useStakingState, type FormData } from "@/ui/baby/state/StakingState";
import { StakingModal } from "@/ui/baby/widgets/StakingModal";
import { SubmitButton } from "@/ui/baby/widgets/SubmitButton";
import { ValidatorField } from "@/ui/baby/widgets/ValidatorField";
import { FormAlert } from "@/ui/common/components/Multistaking/MultistakingForm/FormAlert";
import { useFormPersistenceState } from "@/ui/common/state/FormPersistenceState";
import { useCoStakingState } from "@/ui/common/state/CoStakingState";

interface StakingFormProps {
  isGeoBlocked?: boolean;
}

/**
 * StakingForm supports multi-validator selection and draft persistence, so it
 * uses 'validatorAddresses' (string[]) instead of the single 'validatorAddress'
 * expected by 'FormData' in 'StakingState'.
 *
 * This interface removes 'validatorAddress' from 'FormData' and adds
 * 'validatorAddresses' to align with the validation schema and 'FormPersistenceState'.
 */
export interface StakingFormFields extends Omit<FormData, "validatorAddress"> {
  validatorAddresses: string[];
}

export default function StakingForm({
  isGeoBlocked = false,
}: StakingFormProps) {
  const {
    loading,
    formSchema,
    availableBalance,
    babyPrice,
    calculateFee,
    showPreview,
    disabled,
  } = useStakingState();
  const location = useLocation();
  const navigate = useNavigate();
  const { eligibility } = useCoStakingState();

  const { babyStakeDraft, setBabyStakeDraft } = useFormPersistenceState();
  const formRef = useRef<FormRef<StakingFormFields>>(null);

  const defaultValues = useMemo<Partial<StakingFormFields>>(() => {
    return {
      amount: babyStakeDraft?.amount,
      validatorAddresses: babyStakeDraft?.validatorAddresses,
      feeAmount: babyStakeDraft?.feeAmount,
    };
  }, [babyStakeDraft]);

  const handlePreview = useCallback(
    ({
      amount,
      validatorAddresses,
      feeAmount,
    }: Required<StakingFormFields>) => {
      showPreview({
        amount,
        feeAmount,
        validatorAddress: validatorAddresses[0],
      });
    },
    [showPreview],
  );

  const handleChange = useCallback(
    (data: DeepPartial<StakingFormFields>) => {
      setBabyStakeDraft({
        ...data,
        validatorAddresses: data.validatorAddresses?.filter(
          (i) => i !== undefined,
        ),
      });
    },
    [setBabyStakeDraft],
  );

  // Handle prefill amount from navigation state
  useEffect(() => {
    const state = location.state as { shouldPrefillCoStaking?: boolean } | null;

    if (!state?.shouldPrefillCoStaking) return;

    if (formRef.current) {
      formRef.current.setValue<"amount">(
        "amount",
        String(eligibility.additionalBabyNeeded) as any,
        {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        },
      );

      const currentFormValues = formRef.current.getValues();
      setBabyStakeDraft({
        amount: eligibility.additionalBabyNeeded,
        validatorAddresses: currentFormValues.validatorAddresses,
        feeAmount: currentFormValues.feeAmount,
      });
    }

    // Clear the state to prevent re-triggering
    navigate(".", { replace: true, state: null });
  }, [
    location.state,
    navigate,
    eligibility.additionalBabyNeeded,
    setBabyStakeDraft,
  ]);

  return (
    <Form
      ref={formRef}
      schema={formSchema}
      className="flex flex-col gap-2"
      onSubmit={handlePreview}
      defaultValues={defaultValues}
      onChange={handleChange}
    >
      <AmountField balance={availableBalance} price={babyPrice} />
      <ValidatorField />
      <FeeField babyPrice={babyPrice} calculateFee={calculateFee} />

      <SubmitButton disabled={loading} isGeoBlocked={isGeoBlocked} />
      <StakingModal />
      <FormAlert {...disabled} />
    </Form>
  );
}
