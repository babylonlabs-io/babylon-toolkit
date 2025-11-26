import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "@uidotdev/usehooks";
import type { FormRef } from "@babylonlabs-io/core-ui";

import {
  AnalyticsCategory,
  AnalyticsMessage,
  trackEvent,
} from "@/ui/common/utils/analytics";

import { type StakingFormFields } from "..";

interface UseValidationTrackerParams {
  formRef: React.RefObject<FormRef<StakingFormFields>>;
  enabledFields: { amount: boolean; validatorAddresses: boolean };
}

export function useValidationTracker({
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

    // Ignore "optionality" validation errors to reduce noise
    if (debouncedAmountFieldError?.errorType === "optionality") return;

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
