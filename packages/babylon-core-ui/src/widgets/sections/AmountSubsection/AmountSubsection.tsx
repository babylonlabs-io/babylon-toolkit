import { HiddenField } from "@/widgets/form/HiddenField";
import { SubSection } from "@/components/SubSection";
import { useFormContext, useWatch } from "react-hook-form";

import { AmountItem } from "../../../components/AmountItem/AmountItem";
import { calculateTokenValueInCurrency, maxDecimals } from "@/utils/helpers";
import { BTC_DECIMAL_PLACES } from "@/utils/constants";

interface BalanceDetails {
  balance: number | string;
  symbol: string;
  price?: number;
  displayUSD?: boolean;
  decimals?: number;
}

interface Props {
  fieldName: string;
  currencyIcon: string;
  currencyName: string;
  placeholder?: string;
  displayBalance?: boolean;
  balanceDetails?: BalanceDetails;
  prefix?: string;
  min?: string;
  step?: string;
  autoFocus?: boolean;
  decimals?: number; // Enforce decimals
}

export const AmountSubsection = ({
  fieldName,
  currencyIcon,
  currencyName,
  displayBalance,
  placeholder = "Enter Amount",
  balanceDetails,
  prefix,
  min = "0",
  step = "any",
  autoFocus = true,
  decimals,
}: Props) => {
  const amount = useWatch({ name: fieldName, defaultValue: "" });
  const { setValue } = useFormContext();

  const amountValue = parseFloat((amount as string) || "0");
  const amountUsd = calculateTokenValueInCurrency(amountValue, balanceDetails?.price ?? 0, {
    zeroDisplay: "$0.00",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // If decimals is specified, validate and restrict input
    if (decimals !== undefined && decimals >= 0) {
      // Handle multiple decimal points by taking only the first one
      const [integer, decimal] = value.split('.', 2);
      
      if (decimal !== undefined && decimal.length > decimals) {
        // Truncate decimal part to specified length
        value = integer + '.' + decimal.slice(0, decimals);
      } else if (decimal !== undefined) {
        // Ensure we only have one decimal point
        value = integer + '.' + decimal;
      } else if (value.includes('.')) {
        // Handle case where there are multiple dots but no decimal part
        value = integer;
      }
    }
    
    setValue(fieldName, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  let subtitle: string | undefined;
  if (balanceDetails) {
    subtitle = `${maxDecimals(Number(balanceDetails.balance), balanceDetails.decimals ?? BTC_DECIMAL_PLACES)} ${balanceDetails.symbol}`;
    if (prefix) {
      subtitle = `${prefix}: ${subtitle}`;
    }
  }
  return (
    <>
      <HiddenField name={fieldName} defaultValue="" />
      <SubSection className="flex w-full flex-col content-center justify-between gap-4">
        <AmountItem
          amount={amount}
          currencyIcon={currencyIcon}
          currencyName={currencyName}
          placeholder={placeholder}
          displayBalance={displayBalance}
          balanceDetails={balanceDetails}
          min={min}
          step={step}
          autoFocus={autoFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          amountUsd={amountUsd}
          subtitle={subtitle}
        />
      </SubSection>
    </>
  );
};
