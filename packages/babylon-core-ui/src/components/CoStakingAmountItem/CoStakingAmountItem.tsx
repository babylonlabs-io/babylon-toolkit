import { SubSection } from "@/components/SubSection";
import { Text } from "@/components/Text";
import { twJoin } from "tailwind-merge";
import "./CoStakingAmountItem.css";

interface CoStakingAmountItemProps {
  title: string;
  amount: string;
  symbol: string;
  caption: string;
  className?: string;
}

export const CoStakingAmountItem = ({ title, amount, symbol, caption, className }: CoStakingAmountItemProps) => {
  return (
    <SubSection className={twJoin("bbn-co-staking-amount-item", className)}>
      <div className="bbn-co-staking-amount-item-header">
        <Text variant="body1">{title}</Text>
        <Text variant="body1">
          {amount} {symbol}
        </Text>
      </div>
      <Text variant="caption" className="bbn-co-staking-amount-item-caption">
        {caption}
      </Text>
    </SubSection>
  );
};

export default CoStakingAmountItem;
