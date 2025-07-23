import { SubSection } from "@/components/SubSection";
import { calculateTokenValueInCurrency } from "@/utils/helpers";
import { AmountItem } from "../../../components/AmountItem/AmountItem";
import { Button } from "../../../components/Button";

interface BalanceDetails {
    balance: number | string;
    symbol: string;
    price?: number;
    displayUSD?: boolean;
    decimals?: number;
}

interface Props {
    amount: number | string;
    currencyIcon: string;
    chainName: string;
    currencyName: string;
    placeholder?: string;
    displayBalance?: boolean;
    balanceDetails?: BalanceDetails;
    min?: string;
    step?: string;
}

export const RewardSubsection = ({
    amount,
    currencyIcon,
    currencyName,
    placeholder = "Enter Amount",
    displayBalance,
    balanceDetails,
    chainName,
    min = "0",
    step = "any",
}: Props) => {
    const amountValue = parseFloat(String(amount));
    const amountUsd = calculateTokenValueInCurrency(amountValue, balanceDetails?.price ?? 0, {
        zeroDisplay: "$0.00",
    });

    return (
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
                autoFocus={false}
                onChange={() => { }}
                onKeyDown={() => { }}
                amountUsd={amountUsd}
                disabled={true}
                subtitle={chainName}
            />
            <Button>Claim</Button>
        </SubSection>
    );
};

export default RewardSubsection; 