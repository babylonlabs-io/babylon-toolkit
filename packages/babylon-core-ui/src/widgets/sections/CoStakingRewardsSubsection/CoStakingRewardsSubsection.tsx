import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CoStakingAmountItem } from "@/components/CoStakingAmountItem";
import "./CoStakingRewardsSubsection.css";

interface Props {
  totalAmount: string;
  totalSymbol: string;
  btcRewardAmount: string;
  btcSymbol: string;
  babyRewardAmount: string;
  babySymbol: string;
  coStakingAmount?: string;
  avatarUrl?: string;
  onClaim?: () => void;
  onStakeMore?: () => void;
  claimDisabled?: boolean;
  stakeMoreCta?: string;
}

export const CoStakingRewardsSubsection = ({
  totalAmount,
  totalSymbol,
  btcRewardAmount,
  btcSymbol,
  babyRewardAmount,
  babySymbol,
  coStakingAmount,
  avatarUrl,
  onClaim,
  onStakeMore,
  claimDisabled,
  stakeMoreCta,
}: Props) => {
  return (
    <div className="bbn-co-staking-rewards">
      <div className="bbn-co-staking-rewards-header">
        {avatarUrl && <Avatar url={avatarUrl} size="large" alt={totalSymbol} />}
        {totalAmount} {totalSymbol}
      </div>

      <div className="bbn-co-staking-rewards-items">
        <CoStakingAmountItem
          title={`${btcSymbol} staking`}
          amount={btcRewardAmount}
          symbol={totalSymbol}
          caption={`Rewards earned by staking ${btcSymbol}`}
        />
        <CoStakingAmountItem
          title={`${babySymbol} staking`}
          amount={babyRewardAmount}
          symbol={totalSymbol}
          caption={`Rewards earned from staking ${babySymbol}`}
        />
        {coStakingAmount && (
          <CoStakingAmountItem
            title="Co-staking"
            amount={coStakingAmount}
            symbol={totalSymbol}
            caption={`Bonus rewards for staking both ${btcSymbol} and ${babySymbol} together`}
          />
        )}
      </div>

      <div className="bbn-co-staking-rewards-actions">
        <Button
          fluid
          size="medium"
          variant={onStakeMore ? "outlined" : "contained"}
          onClick={onClaim}
          disabled={claimDisabled}
        >
          Claim Rewards
        </Button>
        {onStakeMore && (
          <Button fluid size="medium" onClick={onStakeMore}>
            {stakeMoreCta}
          </Button>
        )}
      </div>
    </div>
  );
};

export default CoStakingRewardsSubsection;
