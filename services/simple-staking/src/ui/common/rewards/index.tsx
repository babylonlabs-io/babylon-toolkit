import {
  Button,
  Card,
  Heading,
  SubSection,
  Text,
  Avatar,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect as useWidgetWalletConnect } from "@babylonlabs-io/wallet-connector";

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

const BABY_TO_STAKE_AMOUNT = (5000).toLocaleString(); // TODO: if amount is 5 digits or more the content doesnt fit in the button
const CO_STAKING_AMOUNT = (100000).toLocaleString();

const MAX_DECIMALS = 6;

export default function RewardsPage() {
  const { open: openWidget } = useWidgetWalletConnect();
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
        {/* TODO: Update mascot image with the happy one (on other branch right now)*/}
        <img
          src="/mascot.png"
          alt="Mascot"
          width={240}
          height={240}
          className="mx-auto mt-8"
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

  return (
    <Content>
      <Card className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] bg-surface px-4 py-6 max-md:border-0 max-md:p-0">
        <AuthGuard fallback={<NotConnected />}>
          <Container
            as="main"
            className="mx-auto flex max-w-[760px] flex-1 flex-col gap-[2rem]"
          >
            <Section title="Total Rewards">
              <SubSection className="flex flex-col gap-4 bg-neutral-200">
                <div className="flex items-center gap-2 text-lg text-accent-primary">
                  <Avatar url={logo} size="large" alt={bbnCoinSymbol}></Avatar>
                  {totalBabyRewards.toLocaleString()} {bbnCoinSymbol}
                </div>

                <div className="flex flex-col gap-2">
                  <SubSection className="flex flex-col bg-neutral-100">
                    <div className="flex justify-between">
                      <Text variant="body1">{btcCoinSymbol} staking</Text>
                      <Text variant="body1">
                        {btcRewardBaby.toLocaleString()} {bbnCoinSymbol}
                      </Text>
                    </div>
                    <Text variant="caption" className="text-accent-secondary">
                      Rewards earned by staking {btcCoinSymbol}
                    </Text>
                  </SubSection>
                  <SubSection className="flex flex-col bg-neutral-100">
                    <div className="flex justify-between">
                      <Text variant="body1">{bbnCoinSymbol} staking</Text>
                      <Text variant="body1">
                        {babyRewardBaby.toLocaleString()} {bbnCoinSymbol}
                      </Text>
                    </div>
                    <Text variant="caption" className="text-accent-secondary">
                      Rewards earned from staking {bbnCoinSymbol}
                    </Text>
                  </SubSection>
                  {FF.IsCoStakingEnabled && (
                    <SubSection className="flex flex-col bg-neutral-100">
                      <div className="flex justify-between">
                        <Text variant="body1">Co-staking</Text>
                        <Text variant="body1">
                          {CO_STAKING_AMOUNT} {bbnCoinSymbol}
                        </Text>
                      </div>
                      <Text variant="caption" className="text-accent-secondary">
                        Bonus rewards for staking both {btcCoinSymbol} and{" "}
                        {bbnCoinSymbol} together
                      </Text>
                    </SubSection>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    fluid
                    className="text-sm" // TODO: add small text to core-ui button
                    variant="outlined"
                    onClick={handleClaimRewardsClick}
                  >
                    Claim Rewards
                  </Button>
                  {FF.IsCoStakingEnabled && (
                    <Button
                      fluid
                      className="text-sm" // TODO: add small text to core-ui button
                      onClick={handleStakeMoreClick}
                    >
                      Stake {BABY_TO_STAKE_AMOUNT} {bbnCoinSymbol} to Unlock{" "}
                      Full Rewards
                    </Button>
                  )}
                </div>
              </SubSection>
            </Section>
          </Container>
        </AuthGuard>
      </Card>
    </Content>
  );
}
