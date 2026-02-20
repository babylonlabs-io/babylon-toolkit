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
  autoFocus?: boolean;
  decimals?: number; // Enforce decimals
  enableMaxButton?: boolean; // Enable Max button to fill max balance
}

export const AmountSubsection = ({
  fieldName,
  currencyIcon,
  currencyName,
  displayBalance,
  placeholder = "Enter Amount",
  balanceDetails,
  prefix,
  autoFocus = true,
  decimals,
  enableMaxButton,
}: Props) => {
  const amount = useWatch({ name: fieldName, defaultValue: "" });
  const { setValue } = useFormContext();

  const amountValue = parseFloat((amount as string) || "0");
  const amountUsd = calculateTokenValueInCurrency(amountValue, balanceDetails?.price ?? 0, {
    zeroDisplay: "$0.00",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    setValue(fieldName, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const handleMaxClick = () => {
    if (balanceDetails?.balance !== undefined) {
      const balanceValue = Number(balanceDetails.balance);
      // Use specified decimals if provided, otherwise use full precision
      const maxValue =
        balanceDetails.decimals !== undefined
          ? maxDecimals(balanceValue, balanceDetails.decimals).toString()
          : balanceValue.toString();
      setValue(fieldName, maxValue, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
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
          autoFocus={autoFocus}
          onChange={handleInputChange}
          amountUsd={amountUsd}
          subtitle={subtitle}
          maxDecimals={decimals}
          {...(enableMaxButton && { onMaxClick: handleMaxClick })}
        />
      </SubSection>
    </>
  );
};
