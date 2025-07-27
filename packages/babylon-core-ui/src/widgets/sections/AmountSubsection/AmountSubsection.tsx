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
  min?: string;
  step?: string;
  autoFocus?: boolean;
}

export const AmountSubsection = ({
  fieldName,
  currencyIcon,
  currencyName,
  displayBalance,
  placeholder = "Enter Amount",
  balanceDetails,
  min = "0",
  step = "any",
  autoFocus = true,
}: Props) => {
  const amount = useWatch({ name: fieldName, defaultValue: "" });
  const { setValue } = useFormContext();

  const amountValue = parseFloat((amount as string) || "0");
  const amountUsd = calculateTokenValueInCurrency(amountValue, balanceDetails?.price ?? 0, {
    zeroDisplay: "$0.00",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(fieldName, e.target.value, {
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

  const subtitle = `Stakable: ${maxDecimals(Number(balanceDetails?.balance), balanceDetails?.decimals ?? BTC_DECIMAL_PLACES)} ${balanceDetails?.symbol}`;

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
