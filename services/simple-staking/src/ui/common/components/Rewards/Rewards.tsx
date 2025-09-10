import {
  RewardsPreviewModal,
  RewardsSubsection,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

import babyTokenIcon from "@/ui/common/assets/baby-token.svg";
import { AuthGuard } from "@/ui/common/components/Common/AuthGuard";
import { Section } from "@/ui/common/components/Section/Section";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { useBbnQuery } from "@/ui/common/hooks/client/rpc/queries/useBbnQuery";
import { useRewardsService } from "@/ui/common/hooks/services/useRewardsService";
import { useIbcDenomNames } from "@/ui/common/hooks/useIbcDenomNames";
import { useRewardsState } from "@/ui/common/state/RewardState";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { mapRewardCoinsToItems } from "@/ui/common/utils/rewards";

import { ClaimStatusModal } from "../Modals/ClaimStatusModal/ClaimStatusModal";

interface RewardItem {
  amount: string;
  currencyIcon: string;
  chainName: string;
  currencyName: string;
  placeholder: string;
  displayBalance: boolean;
  balanceDetails: {
    balance: string;
    symbol: string;
    price: number;
    displayUSD: boolean;
    decimals: number;
  };
}

/**
 * Generates a circular placeholder icon with a letter in the center as an SVG data URI.
 * Used as a fallback when the BABY token icon is not available for non-BABY tokens.
 *
 * @param letter - The character to display in the center of the circular icon
 * @returns SVG data URI string that can be used as an image source
 */
// kept for local use through utils

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

  const { showPreview, claimRewards } = useRewardsService();
  const { rewardCoinsQuery } = useBbnQuery();

  const {
    networkName: bbnNetworkName,
    coinSymbol: bbnCoinSymbol,
    lcdUrl,
  } = getNetworkConfigBBN();

  // Build rewards list from per-denom rewards; fallback to BABY only if empty
  const formattedRewardBaby = rewardBalance
    ? ubbnToBaby(rewardBalance).toString()
    : "0";
  const babyIcon = /BABY$/i.test(bbnCoinSymbol) ? babyTokenIcon : "";

  // Resolve base denoms for IBC tokens via LCD denom traces
  const ibcDenomNames = useIbcDenomNames({
    coins: rewardCoinsQuery.data,
    lcdUrl,
  });

  const rewards: RewardItem[] = (() => {
    const coins = rewardCoinsQuery.data ?? [];
    console.log("[RewardsFlow] For each reward denom (switch): start", {
      count: coins.length,
    });
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

    const items = mapRewardCoinsToItems({
      coins,
      ibcDenomNames,
      bbnNetworkName,
      bbnCoinSymbol,
      babyIcon,
    }) as RewardItem[];
    console.log("[RewardsFlow] For each reward denom (switch): done", {
      produced: items.length,
    });
    return items;
  })();

  const [previewOpen, setPreviewOpen] = useState(false);

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

  const claimDisabled =
    processing ||
    ((rewardCoinsQuery.data?.length ?? 0) === 0 && !rewardBalance);

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
