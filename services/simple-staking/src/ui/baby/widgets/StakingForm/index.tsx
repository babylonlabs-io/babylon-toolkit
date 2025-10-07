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
import {
  NAVIGATION_STATE_KEYS,
  type NavigationState,
} from "@/ui/common/constants/navigation";

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
  const { eligibility, isLoading: isCoStakingLoading } = useCoStakingState();

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
    const state = location.state as NavigationState | null;

    if (!state?.[NAVIGATION_STATE_KEYS.PREFILL_COSTAKING]) return;

    // Guard against loading state - wait for co-staking service to finish loading
    if (isCoStakingLoading) return;

    // Guard against zero or invalid values
    if (eligibility.additionalBabyNeeded <= 0) return;

    if (formRef.current) {
      formRef.current.setValue<"amount">(
        "amount",
        eligibility.additionalBabyNeeded,
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

    /**
     * Clear navigation state to prevent re-triggering prefill.
     *
     * - navigate("."): Navigate to current route (relative path)
     * - replace: true: Replace history entry instead of pushing new one
     *   (prevents back button from re-triggering prefill)
     * - state: null: Clear the shouldPrefillCoStaking flag
     *
     * Without this, refreshing the page or re-rendering would
     * attempt to prefill the form again.
     */
    navigate(".", { replace: true, state: null });
  }, [
    location.state,
    navigate,
    eligibility.additionalBabyNeeded,
    isCoStakingLoading,
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
