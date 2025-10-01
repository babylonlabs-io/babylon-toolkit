import {
  Button,
  Card,
  Heading,
  Text,
  CoStakingRewardsSubsection,
  RewardsPreviewModal,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { Section } from "@/ui/common/components/Section/Section";
import { AuthGuard } from "@/ui/common/components/Common/AuthGuard";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import FF from "@/ui/common/utils/FeatureFlagService";
import { useRewardsState as useBtcRewardsState } from "@/ui/common/state/RewardState";
import {
  RewardState,
  useRewardState as useBabyRewardState,
} from "@/ui/baby/state/RewardState";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";
import { useRewardsService } from "@/ui/common/hooks/services/useRewardsService";
import { ClaimStatusModal } from "@/ui/common/components/Modals/ClaimStatusModal/ClaimStatusModal";

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const BABY_TO_STAKE_AMOUNT = 5324;
const CO_STAKING_AMOUNT = 100000;

const MAX_DECIMALS = 6;

type ClaimType = "btc_staking" | "baby_staking";

function RewardsPageContent() {
  const { open: openWidget } = useWalletConnect();
  const { loading: cosmosWalletLoading } = useCosmosWallet();
  const navigate = useNavigate();
  const { logo, coinSymbol: bbnCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();

  const {
    rewardBalance: btcRewardUbbn,
    processing: btcProcessing,
    showProcessingModal: btcShowProcessingModal,
    closeProcessingModal: btcCloseProcessingModal,
    transactionFee: btcTransactionFee,
    transactionHash: btcTransactionHash,
    setTransactionHash: btcSetTransactionHash,
  } = useBtcRewardsState();
  const {
    totalReward: babyRewardUbbn,
    claimAll: babyClaimAll,
    loading: babyLoading,
  } = useBabyRewardState();

  const { showPreview: btcShowPreview, claimRewards: btcClaimRewards } =
    useRewardsService();

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

  const [previewOpen, setPreviewOpen] = useState(false);
  const [typeToClaim] = useState<ClaimType>("btc_staking");

  const processing =
    typeToClaim === "btc_staking" ? btcProcessing : babyLoading;
  const showProcessingModal =
    typeToClaim === "btc_staking" ? btcShowProcessingModal : false;
  const transactionHash =
    typeToClaim === "btc_staking" ? btcTransactionHash : "";
  const transactionFee = typeToClaim === "btc_staking" ? btcTransactionFee : 0;

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
    navigate("/baby");
  };

  const handleClaimClick = async () => {
    if (processing) return;

    // Claim based on the default typeToClaim
    if (typeToClaim === "btc_staking") {
      if (!btcRewardUbbn || btcRewardUbbn === 0) return;
      await btcShowPreview();
      setPreviewOpen(true);
    } else if (typeToClaim === "baby_staking") {
      if (!babyRewardUbbn || babyRewardUbbn === 0n) return;
      setPreviewOpen(true);
    }
  };

  const handleProceed = () => {
    if (typeToClaim === "btc_staking") {
      btcClaimRewards();
    } else if (typeToClaim === "baby_staking") {
      babyClaimAll();
    }
    setPreviewOpen(false);
  };

  const handleClose = () => {
    setPreviewOpen(false);
  };

  const claimDisabled =
    typeToClaim === "btc_staking"
      ? !btcRewardUbbn || btcRewardUbbn === 0 || processing
      : !babyRewardUbbn || babyRewardUbbn === 0n || processing;

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
                onClaim={handleClaimClick}
                claimDisabled={claimDisabled}
                onStakeMore={
                  FF.IsCoStakingEnabled ? handleStakeMoreClick : undefined
                }
                stakeMoreCta={stakeMoreCta}
              />
            </Section>
          </Container>
        </AuthGuard>
      </Card>

      <RewardsPreviewModal
        open={previewOpen}
        processing={processing}
        title={
          typeToClaim === "btc_staking"
            ? "Claim BTC Staking Rewards"
            : "Claim BABY Staking Rewards"
        }
        onClose={handleClose}
        onProceed={handleProceed}
        tokens={[
          {
            name: bbnCoinSymbol,
            amount: {
              token: `${
                typeToClaim === "btc_staking" ? btcRewardBaby : babyRewardBaby
              } ${bbnCoinSymbol}`,
              usd: "",
            },
          },
        ]}
        transactionFees={{
          token: `${ubbnToBaby(transactionFee).toFixed(6)} ${bbnCoinSymbol}`,
          usd: "",
        }}
      />

      <ClaimStatusModal
        open={showProcessingModal}
        onClose={() => {
          if (typeToClaim === "btc_staking") {
            btcCloseProcessingModal();
            btcSetTransactionHash("");
          }
        }}
        loading={processing}
        transactionHash={transactionHash}
      />
    </Content>
  );
}

export default function RewardsPage() {
  return (
    <RewardState>
      <RewardsPageContent />
    </RewardState>
  );
}
