import { SubSection } from "@/components/SubSection";
import { calculateTokenValueInCurrency } from "@/utils/helpers";
import { AmountItem } from "../../../components/AmountItem";
import { Button } from "../../../components/Button";

interface BalanceDetails {
    balance: number | string;
    symbol: string;
    price?: number;
    displayUSD?: boolean;
    decimals?: number;
}

interface Reward {
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

interface Props {
    rewards: Reward[];
    onClick?: () => void;
    disabled?: boolean;
}

export const RewardsSubsection = ({ rewards, onClick, disabled }: Props) => {
    return (
        <SubSection className="flex w-full flex-col content-center justify-between gap-4">
            {rewards.map((reward, index) => {
                const amountValue = Number.parseFloat(String(reward.amount));
                const amountUsd = calculateTokenValueInCurrency(
                    amountValue,
                    reward.balanceDetails?.price ?? 0,
                    { zeroDisplay: "$0.00" },
                );

                return (
                    <AmountItem
                        key={index}
                        amount={reward.amount}
                        currencyIcon={reward.currencyIcon}
                        currencyName={reward.currencyName}
                        placeholder={reward.placeholder ?? "Enter Amount"}
                        displayBalance={reward.displayBalance}
                        balanceDetails={reward.balanceDetails}
                        min={reward.min ?? "0"}
                        step={reward.step ?? "any"}
                        autoFocus={false}
                        onChange={() => { }}
                        onKeyDown={() => { }}
                        amountUsd={amountUsd}
                        disabled={true}
                        subtitle={reward.chainName}
                    />
                );
            })}
            <Button onClick={onClick} disabled={disabled}>Claim</Button>
        </SubSection>
    );
};

export default RewardsSubsection;