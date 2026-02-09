import { useCallback, useState } from "react";

export interface DepositFormErrors {
  amount?: string;
  application?: string;
  provider?: string;
}

export type DepositFormErrorField = keyof DepositFormErrors;

export function useDepositFormErrors() {
  const [errors, setErrors] = useState<DepositFormErrors>({});

  const clearFieldError = useCallback((field: DepositFormErrorField) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const resetErrors = useCallback(() => {
    setErrors({});
  }, []);

  return { errors, setErrors, clearFieldError, resetErrors };
}
