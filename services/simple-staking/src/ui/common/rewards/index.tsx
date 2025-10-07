import {
  Button,
  Card,
  Heading,
  Text,
  CoStakingRewardsSubsection,
  RewardsPreviewModal,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";
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
import { calculateCoStakingAmount } from "@/ui/common/utils/calculateCoStakingAmount";
import {
  NAVIGATION_STATE_KEYS,
  type NavigationState,
} from "@/ui/common/constants/navigation";

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

  const { claimRewards: btcClaimRewards } = useRewardsService();

  const {
    getAdditionalBabyNeeded,
    rewardsTracker,
    currentRewards,
    rewardSupply,
    aprData,
  } = useCoStakingService();

  const additionalBabyNeeded = getAdditionalBabyNeeded();

  const btcRewardBaby = maxDecimals(
    ubbnToBaby(Number(btcRewardUbbn || 0)),
    MAX_DECIMALS,
  );
  const babyRewardBaby = maxDecimals(
    ubbnToBaby(Number(babyRewardUbbn || 0n)),
    MAX_DECIMALS,
  );

  // Note: Co-staking bonus is already included in BTC rewards
  // Total = BTC rewards (includes co-staking bonus if eligible) + BABY rewards
  const totalBabyRewards = maxDecimals(
    btcRewardBaby + babyRewardBaby,
    MAX_DECIMALS,
  );

  // Calculate co-staking amount split from BTC rewards
  const coStakingSplit = calculateCoStakingAmount(
    btcRewardBaby,
    rewardsTracker?.total_score,
    currentRewards?.total_score,
    rewardsTracker?.active_baby,
    rewardSupply,
    aprData?.btc_staking,
  );

  const coStakingAmountBaby = coStakingSplit?.coStakingAmount;
  const baseBtcRewardBaby = coStakingSplit?.baseBtcAmount ?? btcRewardBaby;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [claimingBtc, setClaimingBtc] = useState(false);
  const [claimingBaby, setClaimingBaby] = useState(false);
  const [btcTxHash, setBtcTxHash] = useState("");
  const [babyTxHash, setBabyTxHash] = useState("");

  const processing =
    btcProcessing || babyLoading || claimingBtc || claimingBaby;
  const showProcessingModal =
    claimingBtc || claimingBaby || btcShowProcessingModal;

  const transactionHashes = [
    btcTxHash || btcTransactionHash,
    babyTxHash,
  ].filter(Boolean);
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
    navigate("/baby", {
      state: {
        [NAVIGATION_STATE_KEYS.PREFILL_COSTAKING]: true,
      } satisfies NavigationState,
    });
  };

  // Hoist reward checks to avoid duplicate declarations
  const hasBtcRewards = btcRewardUbbn && btcRewardUbbn > 0;
  const hasBabyRewards = babyRewardUbbn && babyRewardUbbn > 0n;

  const handleClaimClick = async () => {
    if (processing) return;

    if (!hasBtcRewards && !hasBabyRewards) return;

    // Skip fee pre-estimation for BTC rewards. Fees are calculated
    // during the actual transaction signing phase, which is more reliable.

    setPreviewOpen(true);
  };

  const handleProceed = async () => {
    setPreviewOpen(false);

    // Claim BTC staking rewards
    if (hasBtcRewards) {
      try {
        setClaimingBtc(true);
        const btcResult = await btcClaimRewards();
        if (btcResult?.txHash) {
          setBtcTxHash(btcResult.txHash);
        }
      } catch (error) {
        console.error("Error claiming BTC rewards:", error);
      } finally {
        setClaimingBtc(false);
      }
    }

    // Claim BABY staking rewards
    if (hasBabyRewards) {
      try {
        setClaimingBaby(true);
        const babyResult = await babyClaimAll();
        if (babyResult?.txHash) {
          setBabyTxHash(babyResult.txHash);
        }
      } catch (error) {
        console.error("Error claiming BABY rewards:", error);
      } finally {
        setClaimingBaby(false);
      }
    }
  };

  const handleClose = () => {
    setPreviewOpen(false);
  };
  // Note: Co-staking bonus is included in BTC rewards, not claimed separately
  const hasAnyRewards = hasBtcRewards || hasBabyRewards;
  const claimDisabled = !hasAnyRewards || processing;

  const isStakeMoreActive = FF.IsCoStakingEnabled && additionalBabyNeeded > 0;

  const stakeMoreCta = isStakeMoreActive
    ? `Stake ${formatter.format(additionalBabyNeeded)} ${bbnCoinSymbol} to Unlock Full Rewards`
    : undefined;

  const tokens = useMemo(() => {
    return [
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
    ];
  }, [
    hasBtcRewards,
    hasBabyRewards,
    btcRewardBaby,
    babyRewardBaby,
    btcCoinSymbol,
    bbnCoinSymbol,
  ]);

  const handleCloseProcessingModal = () => {
    // Reset all claim-related state variables
    btcCloseProcessingModal();
    btcSetTransactionHash("");
    setBtcTxHash("");
    setBabyTxHash("");
    // Ensure claiming flags are reset even if finally blocks didn't execute
    setClaimingBtc(false);
    setClaimingBaby(false);
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
              <CoStakingRewardsSubsection
                totalAmount={`${totalBabyRewards.toLocaleString()}`}
                totalSymbol={bbnCoinSymbol}
                btcRewardAmount={`${baseBtcRewardBaby.toLocaleString()}`}
                btcSymbol={btcCoinSymbol}
                babyRewardAmount={`${babyRewardBaby.toLocaleString()}`}
                babySymbol={bbnCoinSymbol}
                coStakingAmount={
                  coStakingAmountBaby !== undefined
                    ? `${coStakingAmountBaby.toLocaleString()}`
                    : undefined
                }
                avatarUrl={logo}
                onClaim={handleClaimClick}
                claimDisabled={claimDisabled}
                onStakeMore={
                  isStakeMoreActive ? handleStakeMoreClick : undefined
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
        tokens={tokens}
        transactionFees={{
          token: `${ubbnToBaby(transactionFee).toFixed(6)} ${bbnCoinSymbol}`,
          usd: "",
        }}
      />

      <ClaimStatusModal
        open={showProcessingModal}
        onClose={handleCloseProcessingModal}
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
