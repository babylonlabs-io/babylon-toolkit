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
import { useCoStakingService } from "@/ui/common/hooks/services/useCoStakingService";

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const MAX_DECIMALS = 6;

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

  const { getAdditionalBabyNeeded } = useCoStakingService();

  const additionalBabyNeeded = getAdditionalBabyNeeded();

  const btcRewardBaby = maxDecimals(
    ubbnToBaby(Number(btcRewardUbbn || 0)),
    MAX_DECIMALS,
  );
  const babyRewardBaby = maxDecimals(
    ubbnToBaby(Number(babyRewardUbbn || 0n)),
    MAX_DECIMALS,
  );
  
  // Note: Co-staking bonus is already included in BTC rewards (via MsgWithdrawRewardForBTCStaking)
  // Total = BTC rewards (includes co-staking bonus if eligible) + BABY rewards
  const totalBabyRewards = maxDecimals(
    btcRewardBaby + babyRewardBaby,
    MAX_DECIMALS,
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const [claimingBtc, setClaimingBtc] = useState(false);
  const [claimingBaby, setClaimingBaby] = useState(false);
  const [btcTxHash, setBtcTxHash] = useState("");
  const [babyTxHash, setBabyTxHash] = useState("");

  const processing =
    btcProcessing || babyLoading || claimingBtc || claimingBaby;
  const showProcessingModal =
    claimingBtc || claimingBaby || btcShowProcessingModal;

  const transactionHashes =
    [btcTxHash || btcTransactionHash, babyTxHash].filter(Boolean);
  const transactionFee = btcTransactionFee; // Primary fee shown is BTC staking fee

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

    const hasBtcRewards = btcRewardUbbn && btcRewardUbbn > 0;
    const hasBabyRewards = babyRewardUbbn && babyRewardUbbn > 0n;

    if (!hasBtcRewards && !hasBabyRewards) return;

    // Show preview for BTC rewards to calculate fees
    if (hasBtcRewards) {
      await btcShowPreview();
    }

    setPreviewOpen(true);
  };

  const handleProceed = async () => {
    setPreviewOpen(false);

    const hasBtcRewards = btcRewardUbbn && btcRewardUbbn > 0;
    const hasBabyRewards = babyRewardUbbn && babyRewardUbbn > 0n;

    try {
      // Claim BTC staking rewards
      if (hasBtcRewards) {
        setClaimingBtc(true);
        const btcResult = await btcClaimRewards();
        if (btcResult?.txHash) {
          setBtcTxHash(btcResult.txHash);
        }
        setClaimingBtc(false);
      }

      // Claim BABY staking rewards
      if (hasBabyRewards) {
        setClaimingBaby(true);
        const babyResult = await babyClaimAll();
        if (babyResult?.txHash) {
          setBabyTxHash(babyResult.txHash);
        }
        setClaimingBaby(false);
      }
    } catch (error) {
      // Error handling is done in the respective services
      console.error("Error claiming rewards:", error);
      setClaimingBtc(false);
      setClaimingBaby(false);
    }
  };

  const handleClose = () => {
    setPreviewOpen(false);
  };

  const hasBtcRewards = btcRewardUbbn && btcRewardUbbn > 0;
  const hasBabyRewards = babyRewardUbbn && babyRewardUbbn > 0n;
  // Note: Co-staking bonus is included in BTC rewards, not claimed separately
  const hasAnyRewards = hasBtcRewards || hasBabyRewards;
  const claimDisabled = !hasAnyRewards || processing;

  const stakeMoreCta = FF.IsCoStakingEnabled && additionalBabyNeeded > 0
    ? `Stake ${formatter.format(additionalBabyNeeded)} ${bbnCoinSymbol} to Unlock Full Rewards`
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
                coStakingAmount={undefined}
                avatarUrl={logo}
                onClaim={handleClaimClick}
                claimDisabled={claimDisabled}
                onStakeMore={
                  FF.IsCoStakingEnabled && additionalBabyNeeded > 0
                    ? handleStakeMoreClick
                    : undefined
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
        title="Claim All Rewards"
        onClose={handleClose}
        onProceed={handleProceed}
        tokens={[
          ...(hasBtcRewards
            ? [
                {
                  name: `${btcCoinSymbol} Staking`,
                  amount: {
                    token: `${btcRewardBaby} ${bbnCoinSymbol}`,
                    usd: "",
                  },
                },
              ]
            : []),
          ...(hasBabyRewards
            ? [
                {
                  name: `${bbnCoinSymbol} Staking`,
                  amount: {
                    token: `${babyRewardBaby} ${bbnCoinSymbol}`,
                    usd: "",
                  },
                },
              ]
            : []),
        ]}
        transactionFees={{
          token: `${ubbnToBaby(transactionFee).toFixed(6)} ${bbnCoinSymbol}`,
          usd: "",
        }}
      />

      <ClaimStatusModal
        open={showProcessingModal}
        onClose={() => {
          btcCloseProcessingModal();
          btcSetTransactionHash("");
          setBtcTxHash("");
          setBabyTxHash("");
        }}
        loading={processing}
        transactionHash={transactionHashes}
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
