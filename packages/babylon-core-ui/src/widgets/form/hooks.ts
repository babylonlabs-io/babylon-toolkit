import { useEffect } from "react";
import { type FieldError, useController, useFormContext, useFormState } from "react-hook-form";

interface FieldProps<V> {
  name: string;
  defaultValue?: V;
  disabled?: boolean;
  autoFocus?: boolean;
  shouldUnregister?: boolean;
  validateOnMount?: boolean;
}

export function useField<V = string>({
  name,
  defaultValue,
  disabled = false,
  autoFocus = false,
  shouldUnregister = false,
  validateOnMount = true,
}: FieldProps<V>) {
  const { setFocus, trigger } = useFormContext();
  const { field, fieldState } = useController({ name, defaultValue, disabled, shouldUnregister });
  const { invalid, isTouched, error } = fieldState;

  useEffect(() => {
    if (validateOnMount) {
      trigger(name, { shouldFocus: autoFocus });
    } else if (autoFocus) {
      setFocus(name);
    }
  }, [name, validateOnMount]);

  return {
    ...field,
    value: field.value as V,
    invalid: invalid && isTouched,
    error: error?.message ?? "",
  };
}

type FieldState = {
  invalid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  isValidating: boolean;
  error?: FieldError;
};

export function useFieldState(field: string): FieldState;
export function useFieldState(field: string[]): FieldState[];
export function useFieldState(field: string | string[]): FieldState | FieldState[] {
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: field });

  const fieldState = Array.isArray(field)
    ? field.map((fieldName) => getFieldState(fieldName, formState))
    : getFieldState(field, formState);

  return fieldState;
}
