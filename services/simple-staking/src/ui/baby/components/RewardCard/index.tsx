import { Avatar, Button, SubSection, Text } from "@babylonlabs-io/core-ui";

import { useRewardState } from "@/ui/baby/state/RewardState";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { calculateTokenValueInCurrency } from "@/ui/common/utils/formatCurrency";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";

const { logo, coinSymbol, displayUSD } = getNetworkConfigBBN();

export function RewardCard() {
  const { totalReward, openClaimModal, loading } = useRewardState();
  const babyPrice = usePrice(coinSymbol);

  const hasRewards = totalReward > 0n;
  const formattedReward = maxDecimals(ubbnToBaby(Number(totalReward)), 6);
  const rewardInUsd = displayUSD
    ? calculateTokenValueInCurrency(Number(formattedReward), babyPrice)
    : undefined;

  return (
    <SubSection className="flex-col gap-4">
      <div className="flex w-full items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <Avatar size="medium" url={logo} alt="BABY" />
          <span className="text-base font-medium text-accent-primary sm:text-lg">
            {coinSymbol}
          </span>
        </div>

        <span className="text-base font-medium text-accent-primary sm:text-lg">
          {formattedReward} {coinSymbol}
        </span>
      </div>

      <Text
        as="div"
        variant="body2"
        className="flex items-center justify-between text-accent-secondary"
      >
        <span>Babylon Genesis</span>
        <span>
          {rewardInUsd !== undefined && rewardInUsd !== null ? rewardInUsd : ""}
        </span>
      </Text>

      <Button fluid onClick={openClaimModal} disabled={!hasRewards || loading}>
        Claim
      </Button>
    </SubSection>
  );
}
