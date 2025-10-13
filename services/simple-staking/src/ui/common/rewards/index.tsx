import {
  Button,
  Card,
  Heading,
  Text,
  CoStakingRewardsSubsection,
  RewardsPreviewModal,
  TokenReward,
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
import { formatBalance } from "@/ui/common/utils/formatCryptoBalance";
import { useRewardsService } from "@/ui/common/hooks/services/useRewardsService";
import {
  ClaimStatus,
  ClaimStatusModal,
  ClaimResult,
} from "@/ui/common/components/Modals/ClaimStatusModal/ClaimStatusModal";
import { useCoStakingState } from "@/ui/common/state/CoStakingState";
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
  const { logo, coinSymbol: bbnCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const navigate = useNavigate();

  const {
    rewardBalance: btcRewardUbbn,
    processing: btcProcessing,
    showProcessingModal: btcShowProcessingModal,
    closeProcessingModal: btcCloseProcessingModal,
    openProcessingModal: btcOpenProcessingModal,
    transactionFee: btcTransactionFee,
    setTransactionHash: btcSetTransactionHash,
  } = useBtcRewardsState();
  const {
    totalReward: babyRewardUbbn,
    claimAll: babyClaimAll,
    loading: babyLoading,
  } = useBabyRewardState();

  const { claimRewards: btcClaimRewards } = useRewardsService();

  const { eligibility, rawAprData } = useCoStakingState();

  const additionalBabyNeeded = eligibility.additionalBabyNeeded;

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

  // Calculate co-staking amount split from BTC rewards using API APR ratios
  const { coStakingAmountBaby, baseBtcRewardBaby } = useMemo(() => {
    // If co-staking APR data not available, return base values
    if (!rawAprData || !rawAprData.current) {
      return {
        coStakingAmountBaby: 0,
        baseBtcRewardBaby: btcRewardBaby,
      };
    }

    const { co_staking_apr, btc_staking_apr, total_apr } = rawAprData.current;

    // If no co-staking APR, all BTC rewards are base BTC rewards
    // Guard against division by zero and invalid numbers
    if (
      co_staking_apr === 0 ||
      total_apr === 0 ||
      !isFinite(total_apr) ||
      total_apr < 0
    ) {
      return {
        coStakingAmountBaby: 0,
        baseBtcRewardBaby: btcRewardBaby,
      };
    }

    // Calculate split based on APR ratios from API
    const coStakingRatio = co_staking_apr / total_apr;
    const btcStakingRatio = btc_staking_apr / total_apr;

    const coStakingAmount = maxDecimals(
      btcRewardBaby * coStakingRatio,
      MAX_DECIMALS,
    );
    const baseBtcAmount = maxDecimals(
      btcRewardBaby * btcStakingRatio,
      MAX_DECIMALS,
    );

    return {
      coStakingAmountBaby: coStakingAmount,
      baseBtcRewardBaby: baseBtcAmount,
    };
  }, [btcRewardBaby, rawAprData]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [claimingBtc, setClaimingBtc] = useState(false);
  const [claimingBaby, setClaimingBaby] = useState(false);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | undefined>();
  const [claimResults, setClaimResults] = useState<ClaimResult[]>([]);

  const processing =
    btcProcessing || babyLoading || claimingBtc || claimingBaby;
  const showProcessingModal =
    claimingBtc ||
    claimingBaby ||
    btcShowProcessingModal ||
    Boolean(claimStatus);

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
    // Ensure processing modal is visible for the entire dual-claim flow
    btcOpenProcessingModal();
    setClaimStatus(ClaimStatus.PROCESSING);
    setClaimResults([]);

    const results: ClaimResult[] = [];

    // Claim BTC staking rewards
    if (hasBtcRewards) {
      try {
        setClaimingBtc(true);
        const btcResult = await btcClaimRewards();
        results.push({
          kind: "btc",
          label: `${btcCoinSymbol} Staking`,
          success: Boolean(btcResult?.txHash),
          txHash: btcResult?.txHash,
        });
      } catch (error) {
        console.error("Error claiming BTC rewards:", error);
        results.push({
          kind: "btc",
          label: `${btcCoinSymbol} Staking`,
          success: false,
        });
      } finally {
        setClaimingBtc(false);
      }
    }

    // Claim BABY staking rewards
    if (hasBabyRewards) {
      try {
        setClaimingBaby(true);
        const babyResult = await babyClaimAll();
        results.push({
          kind: "baby",
          label: `${bbnCoinSymbol} Staking`,
          success: Boolean(babyResult?.txHash),
          txHash: babyResult?.txHash,
        });
      } catch (error) {
        console.error("Error claiming BABY rewards:", error);
        results.push({
          kind: "baby",
          label: `${bbnCoinSymbol} Staking`,
          success: false,
        });
      } finally {
        setClaimingBaby(false);
      }
    }

    // Determine overall status once both attempts are done
    setClaimResults(results);
    const anySuccess = results.some((r) => r.success);
    const anyFailure = results.some((r) => !r.success);
    if (anySuccess && anyFailure) setClaimStatus(ClaimStatus.PARTIAL);
    else if (anySuccess && !anyFailure) setClaimStatus(ClaimStatus.SUCCESS);
    else if (!anySuccess && anyFailure) setClaimStatus(ClaimStatus.ERROR);
    else setClaimStatus(ClaimStatus.SUCCESS); // nothing to claim
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
    const items: TokenReward[] = [];

    if (hasBtcRewards) {
      items.push({
        name: `${btcCoinSymbol} Staking`,
        amount: {
          token: formatBalance(baseBtcRewardBaby, bbnCoinSymbol),
          usd: "",
        },
      });
    }

    if (hasBabyRewards) {
      items.push({
        name: `${bbnCoinSymbol} Staking`,
        amount: {
          token: formatBalance(babyRewardBaby, bbnCoinSymbol),
          usd: "",
        },
      });
    }

    if (hasBtcRewards && coStakingAmountBaby && coStakingAmountBaby > 0) {
      items.push({
        name: `Co-staking`,
        amount: {
          token: formatBalance(coStakingAmountBaby, bbnCoinSymbol),
          usd: "",
        },
      });
    }

    return items;
  }, [
    hasBtcRewards,
    hasBabyRewards,
    baseBtcRewardBaby,
    coStakingAmountBaby,
    babyRewardBaby,
    btcCoinSymbol,
    bbnCoinSymbol,
  ]);

  const handleCloseProcessingModal = () => {
    // Reset all claim-related state variables
    btcCloseProcessingModal();
    btcSetTransactionHash("");
    // Ensure claiming flags are reset even if finally blocks didn't execute
    setClaimingBtc(false);
    setClaimingBaby(false);
    setClaimResults([]);
    setClaimStatus(undefined);
  };

  return (
    <Content>
      <Card className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] bg-surface px-4 py-6 max-md:border-0">
        <AuthGuard fallback={<NotConnected />}>
          <Container
            as="main"
            className="mx-auto flex max-w-[760px] flex-1 flex-col gap-[2rem]"
          >
            <Section title="Total Rewards">
              <CoStakingRewardsSubsection
                totalAmount={formatBalance(totalBabyRewards)}
                totalSymbol={bbnCoinSymbol}
                btcRewardAmount={formatBalance(baseBtcRewardBaby)}
                btcSymbol={btcCoinSymbol}
                babyRewardAmount={formatBalance(babyRewardBaby)}
                babySymbol={bbnCoinSymbol}
                coStakingAmount={
                  coStakingAmountBaby !== undefined
                    ? formatBalance(coStakingAmountBaby)
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
        status={claimStatus}
        results={claimResults}
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
