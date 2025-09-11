import {
  RewardsPreviewModal,
  RewardsSubsection,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { AuthGuard } from "@/ui/common/components/Common/AuthGuard";
import { Section } from "@/ui/common/components/Section/Section";
import { useRewardsState } from "@/ui/common/state/RewardState";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import babyTokenIcon from "@/ui/common/assets/baby-token.svg";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { useIbcDenomNames } from "@/ui/common/hooks/useIbcDenomNames";
import { mapRewardCoinsToItems } from "@/ui/common/utils/rewards";
import { useBbnQuery } from "@/ui/common/hooks/client/rpc/queries/useBbnQuery";
import { useRewardsService } from "@/ui/common/hooks/services/useRewardsService";

import { ClaimStatusModal } from "../Modals/ClaimStatusModal/ClaimStatusModal";

export function Rewards() {
  const {
    processing,
    showProcessingModal,
    closeProcessingModal,
    rewardBalance,
    transactionFee,
    transactionHash,
    setTransactionHash,
  } = useRewardsState();

  const { rewardCoinsQuery } = useBbnQuery();
  const { showPreview, claimRewards } = useRewardsService();

  const { networkName: bbnNetworkName, coinSymbol: bbnCoinSymbol } = getNetworkConfigBBN();
  const babyIcon = /BABY$/i.test(bbnCoinSymbol) ? babyTokenIcon : "";
  const rewardCoins = rewardCoinsQuery.data ?? [];
  const ibcDenomNames = useIbcDenomNames({ coins: rewardCoins });
  const formattedRewardBaby = rewardBalance ? ubbnToBaby(rewardBalance).toString() : "0";
  const rewards = (() => {
    const coins = rewardCoins ?? [];
    if (!coins.length) {
      return [
        {
          amount: formattedRewardBaby,
          currencyIcon: babyIcon,
          chainName: bbnNetworkName,
          currencyName: bbnCoinSymbol,
          placeholder: "0",
          displayBalance: true,
          balanceDetails: {
            balance: formattedRewardBaby,
            symbol: bbnCoinSymbol,
            price: 0,
            displayUSD: false,
            decimals: 6,
          },
        },
      ];
    }
    return mapRewardCoinsToItems({
      coins,
      ibcDenomNames,
      bbnNetworkName,
      bbnCoinSymbol,
      babyIcon,
    }).map((r) => ({ ...r, currencyIcon: r.currencyIcon ?? "" }));
  })();

  const [previewOpen, setPreviewOpen] = useState(false);

  const claimDisabled = processing || ((rewardCoinsQuery.data?.length ?? 0) === 0 && !rewardBalance);

  const handleClick = async () => {
    const hasAnyRewards = (rewardCoinsQuery.data?.length ?? 0) > 0;
    if ((!hasAnyRewards && !rewardBalance) || processing) return;
    await showPreview();
    setPreviewOpen(true);
  };

  const handleProceed = () => {
    claimRewards();
    setPreviewOpen(false);
  };

  const handleClose = () => {
    setPreviewOpen(false);
  };

  return (
    <AuthGuard>
      <Section title="Rewards" titleClassName="md:text-[1.25rem] mt-10">
        <RewardsSubsection
          rewards={rewards}
          disabled={claimDisabled}
          onClick={handleClick}
        />
      </Section>

      <RewardsPreviewModal
        open={previewOpen}
        processing={processing}
        title="Claim Rewards"
        onClose={handleClose}
        onProceed={handleProceed}
        tokens={rewards.map((r) => ({
          name: r.chainName,
          amount: {
            token: `${r.amount} ${r.balanceDetails.symbol}`,
            usd: "",
          },
        }))}
        transactionFees={{
          token: `${ubbnToBaby(transactionFee).toFixed(6)} ${bbnCoinSymbol}`,
          usd: "",
        }}
      />

      <ClaimStatusModal
        open={showProcessingModal}
        onClose={() => {
          closeProcessingModal();
          setTransactionHash("");
        }}
        loading={processing}
        transactionHash={transactionHash}
      />
    </AuthGuard>
  );
}
