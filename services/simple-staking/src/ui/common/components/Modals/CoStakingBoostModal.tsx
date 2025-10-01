import { useCallback, useMemo } from "react";

import { Network } from "@/ui/common/types/network";

import { useSystemStats } from "../../hooks/client/api/useSystemStats";
import { getNetworkConfigBTC } from "../../config/network/btc";
import { getNetworkConfigBBN } from "../../config/network/bbn";

import { SubmitModal } from "./SubmitModal";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export const CoStakingBoostModal: React.FC<FeedbackModalProps> = ({
  open,
  onClose,
}) => {
  const { network, coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const { coinSymbol: babyCoinSymbol } = getNetworkConfigBBN();
  const { data: { btc_staking_apr: stakingAPR } = {} } = useSystemStats();

  const assumedStakingAPR = stakingAPR ? stakingAPR + 1 : 0; // TODO: Get the actual assumed APR
  const assumedBabyAmount = 100; // TODO: Get the actual assumed BABY amount

  const formatAPRPercentage = useCallback(
    (apr: number | undefined): string => {
      return network === Network.MAINNET && apr ? (apr * 100).toFixed(2) : "0";
    },
    [network],
  );

  const submitButtonText = useMemo(
    () =>
      `Stake ${assumedBabyAmount} ${babyCoinSymbol} to Boost to ${formatAPRPercentage(assumedStakingAPR)}%`,
    [assumedBabyAmount, babyCoinSymbol, assumedStakingAPR, formatAPRPercentage],
  );

  return (
    <SubmitModal
      icon={
        <img
          src="/mascot-head-happy.png"
          alt="Mascot head happy illustration"
          className="mb-10 h-full w-full object-cover"
        />
      }
      iconParentClassName="h-40 w-80 bg-transparent" // Safelisted in tailwind.config.ts
      title="Boost your BTC staking rewards"
      open={open}
      submitButton={submitButtonText}
      cancelButton=""
      onSubmit={onClose}
    >
      <p className="text-center text-base text-accent-secondary">
        Your current APR is{" "}
        <span className="text-accent-primary">
          {formatAPRPercentage(stakingAPR)}%
        </span>
        . Stake {assumedBabyAmount} {babyCoinSymbol} to boost it up to{" "}
        <span className="text-accent-primary">
          {formatAPRPercentage(assumedStakingAPR)}%
        </span>
        . Co-staking lets you earn more by pairing your {btcCoinSymbol} stake
        with {babyCoinSymbol}.
      </p>
    </SubmitModal>
  );
};
