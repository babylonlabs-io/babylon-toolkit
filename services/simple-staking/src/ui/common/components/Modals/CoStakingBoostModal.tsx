import { useMemo } from "react";

import { getNetworkConfigBTC } from "../../config/network/btc";
import { getNetworkConfigBBN } from "../../config/network/bbn";
import { useCoStakingService } from "../../hooks/services/useCoStakingService";
import { formatAPRPercentage } from "../../utils/formatAPR";

import { SubmitModal } from "./SubmitModal";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export const CoStakingBoostModal: React.FC<FeedbackModalProps> = ({
  open,
  onClose,
}) => {
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const { coinSymbol: babyCoinSymbol } = getNetworkConfigBBN();
  const { getCoStakingAPR } = useCoStakingService();

  const { currentApr, boostApr, additionalBabyNeeded } = getCoStakingAPR();

  const submitButtonText = useMemo(
    () =>
      `Stake ${additionalBabyNeeded.toFixed(2)} ${babyCoinSymbol} to Boost to ${formatAPRPercentage(boostApr)}%`,
    [additionalBabyNeeded, babyCoinSymbol, boostApr],
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
          {formatAPRPercentage(currentApr)}%
        </span>
        . Stake {additionalBabyNeeded.toFixed(2)} {babyCoinSymbol} to boost it
        up to{" "}
        <span className="text-accent-primary">
          {formatAPRPercentage(boostApr)}%
        </span>
        . Co-staking lets you earn more by pairing your {btcCoinSymbol} stake
        with {babyCoinSymbol}.
      </p>
    </SubmitModal>
  );
};
