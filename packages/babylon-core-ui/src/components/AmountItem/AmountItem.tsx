import React from "react";

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
    min: string;
    step: string;
    autoFocus: boolean;
    amountUsd: string;
    subtitle?: string;
    disabled?: boolean;
    readOnly?: boolean;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
    onMaxClick?: () => void; // NEW - handler for max button click
}

export const AmountItem = ({
    amount,
    currencyIcon,
    currencyName,
    placeholder = "Enter Amount",
    displayBalance,
    balanceDetails,
    min,
    step,
    autoFocus,
    onChange,
    onKeyDown,
    amountUsd,
    disabled = false,
    readOnly = false,
    onMaxClick,
}: AmountItemProps) => {
    return (
        <>
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
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    disabled={disabled}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-2/3 bg-transparent text-right text-lg outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                            {typeof balanceDetails.balance === 'number'
                                ? balanceDetails.balance.toLocaleString('en-US', {
                                    minimumFractionDigits: balanceDetails.decimals ?? 8,
                                    maximumFractionDigits: balanceDetails.decimals ?? 8
                                  })
                                : balanceDetails.balance} {balanceDetails.symbol}
                        </span>
                    </div>
                    {balanceDetails.displayUSD && balanceDetails.price !== undefined && (
                        <div>{amountUsd} USD</div>
                    )}
                </div>
            ) : null}
        </>
    );
};

export default AmountItem;