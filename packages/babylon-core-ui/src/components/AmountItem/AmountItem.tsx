import React from "react";

interface BalanceDetails {
    balance: number | string;
    symbol: string;
    price?: number;
    displayUSD?: boolean;
    decimals?: number;
}

interface AmountItemProps {
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
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
}

export const AmountItem = ({
    amount,
    currencyIcon,
    currencyName,
    placeholder = "Enter Amount",
    subtitle,
    displayBalance,
    balanceDetails,
    min,
    step,
    autoFocus,
    onChange,
    onKeyDown,
    amountUsd,
    disabled = false,
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
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-2/3 bg-transparent text-right text-lg outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
            </div>

            {balanceDetails && displayBalance ? (
                <div className="flex w-full flex-row content-center justify-between text-sm">
                    <span className="cursor-default">
                        {subtitle}
                    </span>
                    {balanceDetails.displayUSD && balanceDetails.price !== undefined && <div>{amountUsd} USD</div>}
                </div>
            ) : null}
        </>
    );
};

export default AmountItem;