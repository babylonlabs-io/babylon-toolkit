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

  const [validationTrackingFields, setValidationTrackingFields] = useState({
    amount: false,
    validatorAddresses: false,
  });
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

  const { prefilledAmountRef, runProgrammaticChange } =
    useStakingFormChangeTracker({
      formRef,
      setBabyStakeDraft,
      setValidationTrackingFields,
      setAmountTrackingPayload,
    });

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
    [showPreview, prefilledAmountRef],
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

      runProgrammaticChange(() => {
        formRef.current?.setValue<"amount">("amount", additionalBabyNeeded, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
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
    runProgrammaticChange,
    prefilledAmountRef,
  ]);

  useValidationTracker({
    formRef,
    enabledFields: validationTrackingFields,
  });

  return (
    <Form
      ref={formRef}
      schema={formSchema}
      className="flex flex-col gap-2"
      onSubmit={handlePreview}
      defaultValues={defaultValues}
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

interface UseValidationTrackerParams {
  formRef: React.RefObject<FormRef<StakingFormFields>>;
  enabledFields: { amount: boolean; validatorAddresses: boolean };
}

function useValidationTracker({
  formRef,
  enabledFields,
}: UseValidationTrackerParams) {
  const lastLoggedErrorsRef = useRef<Record<string, string | undefined>>({});
  const [amountError, setAmountError] = useState<
    { message: string; errorType?: string } | undefined
  >(undefined);
  const [validatorError, setValidatorError] = useState<
    { message: string; errorType?: string } | undefined
  >(undefined);

  const getFieldError = useCallback(
    (fieldName: keyof StakingFormFields) => {
      const form = formRef.current;
      if (!form) return undefined;

      const { error, isDirty, isTouched } = form.getFieldState(
        fieldName,
        form.formState,
      );

      if (!(isDirty || isTouched) || !error) return undefined;
      if (typeof error.message !== "string") return undefined;

      return {
        message: error.message,
        errorType: typeof error.type === "string" ? error.type : undefined,
      };
    },
    [formRef],
  );

  const updateFieldErrors = useCallback(() => {
    if (!formRef.current) return;

    if (enabledFields.amount) {
      setAmountError((previous) => {
        const next = getFieldError("amount");
        if (
          previous?.message === next?.message &&
          previous?.errorType === next?.errorType
        )
          return previous;
        return next;
      });
    } else {
      setAmountError(undefined);
    }

    if (enabledFields.validatorAddresses) {
      setValidatorError((previous) => {
        const next = getFieldError("validatorAddresses");
        if (
          previous?.message === next?.message &&
          previous?.errorType === next?.errorType
        )
          return previous;
        return next;
      });
    } else {
      setValidatorError(undefined);
    }
  }, [
    enabledFields.amount,
    enabledFields.validatorAddresses,
    getFieldError,
    formRef,
  ]);

  useEffect(() => {
    if (!formRef.current) return;

    updateFieldErrors();

    const subscription = formRef.current.watch(() => {
      updateFieldErrors();
    });

    return () => subscription.unsubscribe();
  }, [formRef, updateFieldErrors]);

  const debouncedAmountFieldError = useDebounce(
    enabledFields.amount ? amountError : undefined,
    300,
  );
  const debouncedValidatorFieldError = useDebounce(
    enabledFields.validatorAddresses ? validatorError : undefined,
    300,
  );

  useEffect(() => {
    if (!enabledFields.amount) return;

    const message = debouncedAmountFieldError?.message;
    if (!message) {
      lastLoggedErrorsRef.current.amount = undefined;
      return;
    }

    if (lastLoggedErrorsRef.current.amount === message) return;

    trackEvent(
      AnalyticsCategory.FORM_INTERACTION,
      AnalyticsMessage.FORM_VALIDATION_ERROR,
      {
        fieldName: "amount",
        errorMessage: message,
        errorType: debouncedAmountFieldError?.errorType,
      },
    );
    lastLoggedErrorsRef.current.amount = message;
  }, [debouncedAmountFieldError, enabledFields.amount]);

  useEffect(() => {
    if (!enabledFields.validatorAddresses) return;

    const message = debouncedValidatorFieldError?.message;
    if (!message) {
      lastLoggedErrorsRef.current.validatorAddresses = undefined;
      return;
    }

    if (lastLoggedErrorsRef.current.validatorAddresses === message) return;

    trackEvent(
      AnalyticsCategory.FORM_INTERACTION,
      AnalyticsMessage.FORM_VALIDATION_ERROR,
      {
        fieldName: "validatorAddresses",
        errorMessage: message,
        errorType: debouncedValidatorFieldError?.errorType,
      },
    );
    lastLoggedErrorsRef.current.validatorAddresses = message;
  }, [debouncedValidatorFieldError, enabledFields.validatorAddresses]);
}

interface UseStakingFormChangeTrackerParams {
  formRef: React.RefObject<FormRef<StakingFormFields>>;
  setBabyStakeDraft: (draft?: Partial<StakingFormFields>) => void;
  setValidationTrackingFields: React.Dispatch<
    React.SetStateAction<{ amount: boolean; validatorAddresses: boolean }>
  >;
  setAmountTrackingPayload: React.Dispatch<
    React.SetStateAction<Record<string, unknown> | null>
  >;
}

function useStakingFormChangeTracker({
  formRef,
  setBabyStakeDraft,
  setValidationTrackingFields,
  setAmountTrackingPayload,
}: UseStakingFormChangeTrackerParams) {
  const prefilledAmountRef = useRef<number | null>(null);
  const previousValuesRef = useRef<Partial<StakingFormFields>>({});
  const hasInitializedWatchRef = useRef(false);
  const isProgrammaticChangeRef = useRef(false);

  const areValidatorsEqual = useCallback(
    (next?: string[], previous?: string[]) => {
      if (!next && !previous) return true;
      if (!next || !previous) return false;
      if (next.length !== previous.length) return false;
      return next.every((validator, index) => validator === previous[index]);
    },
    [],
  );

  const handleChange = useCallback(
    (
      data: DeepPartial<StakingFormFields>,
      info?: { name?: string; type?: string },
    ) => {
      if (!data) return;

      const filteredValidatorAddresses = data.validatorAddresses?.filter(
        (validator): validator is string => typeof validator === "string",
      );

      const nextValues: Partial<StakingFormFields> = {
        amount: data.amount,
        validatorAddresses: filteredValidatorAddresses,
        feeAmount: data.feeAmount,
      };

      setBabyStakeDraft(nextValues);

      const amountValue =
        typeof data.amount === "number" ? data.amount : undefined;

      const previousValues = previousValuesRef.current;

      const amountChanged =
        "amount" in data && data.amount !== previousValues.amount;

      const validatorsChanged = !areValidatorsEqual(
        filteredValidatorAddresses,
        previousValues.validatorAddresses,
      );

      if (!hasInitializedWatchRef.current || isProgrammaticChangeRef.current) {
        previousValuesRef.current = nextValues;
        hasInitializedWatchRef.current = true;
        return;
      }

      if (amountChanged) {
        setValidationTrackingFields((previous) =>
          previous.amount ? previous : { ...previous, amount: true },
        );

        const wasPrefilledFromCoStaking =
          amountValue !== undefined &&
          prefilledAmountRef.current !== null &&
          amountValue === prefilledAmountRef.current;

        setAmountTrackingPayload({
          fieldName: "amount",
          hasValue: Boolean(data.amount),
          valueType: typeof data.amount,
          wasPrefilledFromCoStaking,
          changeType: info?.type,
        });

        const shouldClearPrefill =
          prefilledAmountRef.current !== null &&
          (amountValue === undefined ||
            amountValue !== prefilledAmountRef.current);

        if (shouldClearPrefill) {
          prefilledAmountRef.current = null;
        }
      }

      if (validatorsChanged) {
        setValidationTrackingFields((previous) =>
          previous.validatorAddresses
            ? previous
            : { ...previous, validatorAddresses: true },
        );
        const list = filteredValidatorAddresses ?? [];

        trackEvent(
          AnalyticsCategory.FORM_INTERACTION,
          AnalyticsMessage.FORM_FIELD_CHANGED,
          {
            fieldName: "validatorAddresses",
            hasValue: list.length > 0,
            valueType: "array",
            arrayCount: list.length,
            validatorCount: list.length,
            changeType: info?.type,
          },
        );
      }

      previousValuesRef.current = nextValues;
    },
    [
      areValidatorsEqual,
      setBabyStakeDraft,
      setValidationTrackingFields,
      setAmountTrackingPayload,
    ],
  );

  useEffect(() => {
    if (!formRef.current) return;

    const subscription = formRef.current.watch((values, info) => {
      handleChange(values, info);
    });

    return () => subscription.unsubscribe();
  }, [formRef, handleChange]);

  // Programmatic change is used to update the form values without triggering a change event.
  // This is used to prefill the co-staking amount and keeping form state persistent.
  const runProgrammaticChange = useCallback((update: () => void) => {
    isProgrammaticChangeRef.current = true;
    update();
    Promise.resolve().then(() => {
      isProgrammaticChangeRef.current = false;
    });
  }, []);

  return { prefilledAmountRef, runProgrammaticChange };
}
