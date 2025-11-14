import { AmountSubsection, useFormContext } from "@babylonlabs-io/core-ui";
import { useEffect, useMemo, useRef } from "react";
import { useDebounce } from "@uidotdev/usehooks";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import {
  AnalyticsCategory,
  AnalyticsMessage,
  trackEvent,
} from "@/ui/common/utils/analytics";

const { logo, coinSymbol, displayUSD } = getNetworkConfigBBN();

interface AmountFieldProps {
  balance?: number;
  price?: number;
}

export const AmountField = ({ balance, price }: AmountFieldProps) => {
  const formContext = useFormContext<{ amount?: number }>();
  const lastLoggedErrorRef = useRef<string | undefined>();

  const amountFieldError = useMemo(() => {
    if (!formContext) {
      return;
    }

    const fieldState = formContext.getFieldState(
      "amount",
      formContext.formState,
    );
    const hasUserInteraction = fieldState.isTouched || fieldState.isDirty;
    if (!hasUserInteraction) return undefined;

    const message =
      fieldState.error && typeof fieldState.error.message === "string"
        ? fieldState.error.message
        : undefined;
    const errorType =
      fieldState.error && typeof fieldState.error.type === "string"
        ? fieldState.error.type
        : undefined;

    if (!message) return undefined;

    return {
      message,
      errorType,
    };
  }, [formContext]);

  const debouncedAmountFieldError = useDebounce(amountFieldError, 300);

  useEffect(() => {
    const message = debouncedAmountFieldError?.message;
    if (!message) {
      lastLoggedErrorRef.current = undefined;
      return;
    }

    if (lastLoggedErrorRef.current === message) return;

    trackEvent(
      AnalyticsCategory.FORM_INTERACTION,
      AnalyticsMessage.FORM_VALIDATION_ERROR,
      {
        fieldName: "amount",
        errorMessage: message,
        errorType: debouncedAmountFieldError?.errorType,
      },
    );
    lastLoggedErrorRef.current = message;
  }, [debouncedAmountFieldError]);

  // Only create balanceDetails if balance is provided (price is optional)
  const balanceDetails =
    balance !== undefined
      ? {
          displayUSD,
          symbol: coinSymbol,
          balance,
          price,
          decimals: 2,
        }
      : undefined;

  return (
    <AmountSubsection
      autoFocus={false}
      displayBalance
      fieldName="amount"
      currencyIcon={logo}
      currencyName={coinSymbol}
      placeholder="Enter Amount"
      {...(balanceDetails && { balanceDetails })}
    />
  );
};
