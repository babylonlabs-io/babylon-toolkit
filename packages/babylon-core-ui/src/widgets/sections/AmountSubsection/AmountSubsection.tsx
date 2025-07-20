import { HiddenField } from "@/widgets/form/HiddenField";
import { SubSection } from "@/components/SubSection";
import { useFormContext, useWatch } from "react-hook-form";

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

  return (
    <SubSection className="flex w-full flex-col content-center justify-between gap-4">
      <div className="flex w-full flex-row content-center items-center justify-between font-normal">
        <div className="flex items-center gap-2">
          <img src={currencyIcon} alt={currencyName} className="h-10 max-h-[2.5rem] w-10 max-w-[2.5rem]" />
          <div className="text-lg">{currencyName}</div>
        </div>
        <input
          type="number"
          value={amount ?? ""}
          min={min}
          step={step}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-2/3 bg-transparent text-right text-lg outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <HiddenField name={fieldName} defaultValue="" />

      {balanceDetails && displayBalance ? (
        <div className="flex w-full flex-row content-center justify-between text-sm">
          <div>
            Stakable:{" "}
            <span className="cursor-default">
              {maxDecimals(Number(balanceDetails.balance), balanceDetails.decimals ?? BTC_DECIMAL_PLACES)}
            </span>{" "}
            {balanceDetails.symbol}
          </div>
          {balanceDetails.displayUSD && balanceDetails.price !== undefined && <div>{amountUsd} USD</div>}
        </div>
      ) : null}
    </SubSection>
  );
};
