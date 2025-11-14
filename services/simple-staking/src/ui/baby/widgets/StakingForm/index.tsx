import { Form, type FormRef } from "@babylonlabs-io/core-ui";
import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useDebounce } from "@uidotdev/usehooks";
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
import {
  AnalyticsMessage,
  trackEvent,
  AnalyticsCategory,
} from "@/ui/common/utils/analytics";
import { formatBabyStakingAmount } from "@/ui/common/utils/formTransforms";

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
    babyPrice,
    calculateFee,
    showPreview,
    disabled,
  } = useStakingState();
  const location = useLocation();
  const navigate = useNavigate();
  const { eligibility, isLoading: isCoStakingLoading } = useCoStakingState();
  const { additionalBabyNeeded } = eligibility;

  const { babyStakeDraft, setBabyStakeDraft } = useFormPersistenceState();
  const formRef = useRef<FormRef<StakingFormFields>>(null);

  const prefilledAmountRef = useRef<number | null>(null);
  const previousValuesRef = useRef<Partial<StakingFormFields>>({});
  const [amountTrackingPayload, setAmountTrackingPayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  const debouncedAmountTrackingPayload = useDebounce(
    amountTrackingPayload,
    300,
  );

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
      trackEvent(
        AnalyticsCategory.CTA_CLICK,
        AnalyticsMessage.PREVIEW_BABY_STAKE,
        {
          wasPrefilledFromCoStaking:
            prefilledAmountRef.current !== null &&
            amount === formatBabyStakingAmount(prefilledAmountRef.current),
        },
      );

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
      const previousValues = previousValuesRef.current;
      const amountValue = Number(data.amount);

      setBabyStakeDraft({
        ...data,
        validatorAddresses: data.validatorAddresses?.filter(
          (i) => i !== undefined,
        ),
      });

      // Track field-level interactions - only for fields that actually changed
      if ("amount" in data && data.amount !== previousValues.amount) {
        const wasPrefilledFromCoStaking =
          amountValue !== undefined &&
          prefilledAmountRef.current !== null &&
          amountValue === prefilledAmountRef.current;

        setAmountTrackingPayload({
          fieldName: "amount",
          hasValue: Boolean(data.amount),
          valueType: typeof data.amount,
          wasPrefilledFromCoStaking,
        });

        // If user modifies the amount away from the prefilled value, clear the prefill marker
        const shouldClearPrefill =
          prefilledAmountRef.current !== null &&
          (amountValue === undefined ||
            amountValue !== prefilledAmountRef.current);

        if (shouldClearPrefill) {
          prefilledAmountRef.current = null;
        }
      }

      if (
        "validatorAddresses" in data &&
        JSON.stringify(data.validatorAddresses) !==
          JSON.stringify(previousValues.validatorAddresses)
      ) {
        const list =
          data.validatorAddresses?.filter((i: unknown) => i !== undefined) ??
          [];

        trackEvent(
          AnalyticsCategory.FORM_INTERACTION,
          AnalyticsMessage.FORM_FIELD_CHANGED,
          {
            fieldName: "validatorAddresses",
            // Redact actual values for privacy, just track that interaction occurred
            hasValue: list.length > 0,
            valueType: "array",
            arrayCount: list.length,
            validatorCount: list.length,
          },
        );
      }

      // Update previous values for next comparison
      previousValuesRef.current = {
        amount: data.amount,
        validatorAddresses: data.validatorAddresses?.filter(
          (i): i is string => i !== undefined,
        ),
        feeAmount: data.feeAmount,
      };
    },
    [setBabyStakeDraft],
  );
  useEffect(() => {
    if (!debouncedAmountTrackingPayload) return;
    trackEvent(
      AnalyticsCategory.FORM_INTERACTION,
      AnalyticsMessage.FORM_FIELD_CHANGED,
      debouncedAmountTrackingPayload,
    );
  }, [debouncedAmountTrackingPayload]);

  // Handle prefill amount from navigation state
  useEffect(() => {
    const state = location.state as NavigationState | null;

    if (!state?.[NAVIGATION_STATE_KEYS.PREFILL_COSTAKING]) return;

    // Guard against loading state - wait for co-staking service to finish loading
    if (isCoStakingLoading) return;

    // Guard against zero or invalid values
    if (additionalBabyNeeded <= 0) return;

    if (formRef.current) {
      // Set prefilledAmountRef before setValue so handleChange can detect it
      prefilledAmountRef.current = additionalBabyNeeded;

      formRef.current.setValue<"amount">("amount", additionalBabyNeeded, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const currentFormValues = formRef.current.getValues();
      setBabyStakeDraft({
        amount: additionalBabyNeeded,
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
    additionalBabyNeeded,
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
      <AmountField />
      <ValidatorField />
      <FeeField babyPrice={babyPrice} calculateFee={calculateFee} />

      <SubmitButton disabled={loading} isGeoBlocked={isGeoBlocked} />
      <StakingModal />
      <FormAlert {...disabled} />
    </Form>
  );
}
