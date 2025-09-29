import {
  Button,
  Card,
  Heading,
  Text,
  CoStakingRewardsSubsection,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";

import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { Section } from "@/ui/common/components/Section/Section";
import { AuthGuard } from "@/ui/common/components/Common/AuthGuard";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import FF from "@/ui/common/utils/FeatureFlagService";
import { useRewardsState } from "@/ui/common/state/RewardState";
import { useRewardState as useBabyRewardState } from "@/ui/baby/state/RewardState";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const BABY_TO_STAKE_AMOUNT = 5324;
const CO_STAKING_AMOUNT = 100000;

const MAX_DECIMALS = 6;

export default function RewardsPage() {
  const { open: openWidget } = useWalletConnect();
  const { loading: cosmosWalletLoading } = useCosmosWallet();

  const { logo, coinSymbol: bbnCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();

  const { rewardBalance: btcRewardUbbn } = useRewardsState();
  const { totalReward: babyRewardUbbn } = useBabyRewardState();

  const btcRewardBaby = maxDecimals(
    ubbnToBaby(Number(btcRewardUbbn || 0)),
    MAX_DECIMALS,
  );
  const babyRewardBaby = maxDecimals(
    ubbnToBaby(Number(babyRewardUbbn || 0n)),
    MAX_DECIMALS,
  );
  const totalBabyRewards = maxDecimals(
    btcRewardBaby + babyRewardBaby,
    MAX_DECIMALS,
  );

  function NotConnected() {
    return (
      <div className="flex flex-col gap-2">
        <img
          src="/mascot-happy.png"
          alt="Mascot Happy"
          width={400}
          height={240}
          className="mx-auto mt-8 max-h-72 object-cover"
        />
        <Heading variant="h5" className="text-center text-accent-primary">
          No wallet connected
        </Heading>
        <Text variant="body1" className="text-center text-accent-secondary">
          Connect your wallet to check your staking activity and rewards
        </Text>
        <Button
          disabled={cosmosWalletLoading}
          variant="contained"
          fluid={true}
          size="large"
          color="primary"
          onClick={openWidget}
          className="mt-6"
        >
          Connect Wallet
        </Button>
      </div>
    );
  }

  const handleStakeMoreClick = () => {
    console.log("handleStakeMoreClick");
  };

  const handleClaimRewardsClick = () => {
    console.log("handleClaimRewardsClick");
    // TODO: which reward does this claim?
  };

  const stakeMoreCta = FF.IsCoStakingEnabled
    ? `Stake ${formatter.format(BABY_TO_STAKE_AMOUNT)} ${bbnCoinSymbol} to Unlock Full Rewards`
    : undefined;

  return (
    <Content>
      <Card className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] bg-surface px-4 py-6 max-md:border-0 max-md:p-0">
        <AuthGuard fallback={<NotConnected />}>
          <Container
            as="main"
            className="mx-auto flex max-w-[760px] flex-1 flex-col gap-[2rem]"
          >
            <Section title="Total Rewards">
              <CoStakingRewardsSubsection
                totalAmount={`${totalBabyRewards.toLocaleString()}`}
                totalSymbol={bbnCoinSymbol}
                btcRewardAmount={`${btcRewardBaby.toLocaleString()}`}
                btcSymbol={btcCoinSymbol}
                babyRewardAmount={`${babyRewardBaby.toLocaleString()}`}
                babySymbol={bbnCoinSymbol}
                coStakingAmount={
                  FF.IsCoStakingEnabled ? `${CO_STAKING_AMOUNT}` : undefined
                }
                avatarUrl={logo}
                onClaim={handleClaimRewardsClick}
                onStakeMore={
                  FF.IsCoStakingEnabled ? handleStakeMoreClick : undefined
                }
                stakeMoreCta={stakeMoreCta}
              />
            </Section>
          </Container>
        </AuthGuard>
      </Card>
    </Content>
  );
}
