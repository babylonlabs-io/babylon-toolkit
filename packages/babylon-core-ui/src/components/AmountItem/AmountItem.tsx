import React from "react";

import { sanitizeNumericInput } from "../../utils/helpers";

export interface BalanceDetails {
  balance: number | string;
  symbol: string;
  price?: number;
  displayUSD?: boolean;
  decimals?: number;
}

export interface AmountItemProps {
  amount: string | number | undefined;
  currencyIcon: string;
  currencyName: string;
  placeholder?: string;
  displayBalance?: boolean;
  balanceDetails?: BalanceDetails;
  autoFocus: boolean;
  amountUsd: string;
  subtitle?: string;
  disabled?: boolean;
  readOnly?: boolean;
  maxDecimals?: number;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onMaxClick?: () => void;
}

export const AmountItem = ({
  amount,
  currencyIcon,
  currencyName,
  placeholder = "Enter Amount",
  displayBalance,
  balanceDetails,
  autoFocus,
  onChange,
  onKeyDown,
  amountUsd,
  disabled = false,
  readOnly = false,
  maxDecimals = 8,
  onMaxClick,
}: AmountItemProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = sanitizeNumericInput(e.target.value);

    if (value === undefined) {
      e.target.value = String(amount ?? "");
      return;
    }

    if (maxDecimals !== undefined && maxDecimals >= 0) {
      const [integer, decimal] = value.split(".", 2);

      if (decimal !== undefined && decimal.length > maxDecimals) {
        value = integer + "." + decimal.slice(0, maxDecimals);
      }
    }

    e.target.value = value;
    onChange(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <>
      <div className="flex w-full flex-row content-center items-center justify-between font-normal">
        <div className="flex items-center gap-2">
          <img src={currencyIcon} alt={currencyName} className="h-10 max-h-[2.5rem] w-10 max-w-[2.5rem]" />
          <div className="text-lg">{currencyName}</div>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={amount ?? ""}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-2/3 appearance-none bg-transparent text-right text-lg outline-none"
        />
      </div>

      {balanceDetails && displayBalance ? (
        <div className="flex w-full flex-row content-center items-center justify-between text-sm text-accent-secondary">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMaxClick}
              disabled={disabled || !onMaxClick}
              className="cursor-pointer rounded bg-secondary-strokeLight px-2 py-0.5 text-xs text-accent-secondary transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Max
            </button>
            <span>
              {typeof balanceDetails.balance === "number"
                ? balanceDetails.balance.toLocaleString("en-US", {
                    minimumFractionDigits: balanceDetails.decimals ?? 8,
                    maximumFractionDigits: balanceDetails.decimals ?? 8,
                  })
                : balanceDetails.balance}{" "}
              {balanceDetails.symbol}
            </span>
          </div>
          {balanceDetails.displayUSD && balanceDetails.price !== undefined && <div>{amountUsd} USD</div>}
        </div>
      ) : null}
    </>
  );
};

export default AmountItem;
