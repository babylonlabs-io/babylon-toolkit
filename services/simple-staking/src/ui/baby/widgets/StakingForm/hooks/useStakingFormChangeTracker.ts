import { useCallback, useEffect, useRef } from "react";
import type { FormRef } from "@babylonlabs-io/core-ui";
import { DeepPartial } from "react-hook-form";

import {
  AnalyticsCategory,
  AnalyticsMessage,
  trackEvent,
} from "@/ui/common/utils/analytics";

import { type StakingFormFields } from "..";

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

export function useStakingFormChangeTracker({
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

  const handleAmountFieldChange = useCallback(
    ({
      amountValue,
      rawAmount,
      changeType,
    }: {
      amountValue?: number;
      rawAmount: DeepPartial<StakingFormFields>["amount"];
      changeType?: string;
    }) => {
      setValidationTrackingFields((previous) =>
        previous.amount ? previous : { ...previous, amount: true },
      );

      const wasPrefilledFromCoStaking =
        amountValue !== undefined &&
        prefilledAmountRef.current !== null &&
        amountValue === prefilledAmountRef.current;

      setAmountTrackingPayload({
        fieldName: "amount",
        hasValue: Boolean(rawAmount),
        valueType: typeof rawAmount,
        wasPrefilledFromCoStaking,
        changeType,
      });

      const shouldClearPrefill =
        prefilledAmountRef.current !== null &&
        (amountValue === undefined ||
          amountValue !== prefilledAmountRef.current);

      if (shouldClearPrefill) {
        prefilledAmountRef.current = null;
      }
    },
    [setValidationTrackingFields, setAmountTrackingPayload],
  );

  const handleValidatorFieldChange = useCallback(
    ({ list, changeType }: { list: string[]; changeType?: string }) => {
      setValidationTrackingFields((previous) =>
        previous.validatorAddresses
          ? previous
          : { ...previous, validatorAddresses: true },
      );

      trackEvent(
        AnalyticsCategory.FORM_INTERACTION,
        AnalyticsMessage.FORM_FIELD_CHANGED,
        {
          fieldName: "validatorAddresses",
          hasValue: list.length > 0,
          valueType: "array",
          arrayCount: list.length,
          validatorCount: list.length,
          changeType,
        },
      );
    },
    [setValidationTrackingFields],
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
        handleAmountFieldChange({
          amountValue,
          rawAmount: data.amount,
          changeType: info?.type,
        });
      }

      if (validatorsChanged) {
        handleValidatorFieldChange({
          list: filteredValidatorAddresses ?? [],
          changeType: info?.type,
        });
      }

      previousValuesRef.current = nextValues;
    },
    [
      areValidatorsEqual,
      handleAmountFieldChange,
      handleValidatorFieldChange,
      setBabyStakeDraft,
    ],
  );

  useEffect(() => {
    if (!formRef.current) return;

    const subscription = formRef.current.watch((values, info) => {
      handleChange(values, info);
    });

    return () => subscription.unsubscribe();
  }, [formRef, handleChange]);

  // Marks form updates as programmatic to exclude them from analytics tracking.
  // This is used for prefilling the co-staking amount and restoring persistent form state.
  const runProgrammaticChange = useCallback((update: () => void) => {
    isProgrammaticChangeRef.current = true;
    update();
    Promise.resolve().then(() => {
      isProgrammaticChangeRef.current = false;
    });
  }, []);

  return { prefilledAmountRef, runProgrammaticChange };
}
