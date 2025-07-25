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
}

export const RewardsSubsection = ({ rewards }: Props) => {
    return (
        <SubSection className="flex w-full flex-col content-center justify-between gap-4">
            {rewards.map((reward, index) => {
                const amountValue = parseFloat(String(reward.amount));
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
            <Button>Claim</Button>
        </SubSection>
    );
};

export default RewardsSubsection;