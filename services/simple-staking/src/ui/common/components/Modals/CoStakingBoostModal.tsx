import { useMemo } from "react";

import { getNetworkConfigBTC } from "../../config/network/btc";
import { getNetworkConfigBBN } from "../../config/network/bbn";
import { useCoStakingState } from "../../state/CoStakingState";
import { formatAPRPairAdaptive } from "../../utils/formatAPR";

import { SubmitModal } from "./SubmitModal";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export const CoStakingBoostModal: React.FC<FeedbackModalProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const { coinSymbol: babyCoinSymbol } = getNetworkConfigBBN();
  const { aprData, eligibility, hasValidBoostData } = useCoStakingState();

  const { a: currentAPRDisplay } = useMemo(
    () => formatAPRPairAdaptive(aprData.currentApr, aprData.boostApr),
    [aprData.currentApr, aprData.boostApr],
  );

  const percentageIncrease = useMemo(() => {
    const current = aprData.currentApr ?? 0;
    const boost = aprData.boostApr ?? 0;
    if (current <= 0 || boost <= current) return 0;
    return ((boost - current) / current) * 100;
  }, [aprData.currentApr, aprData.boostApr]);

  const submitButtonText = useMemo(
    () =>
      `Stake ${eligibility.additionalBabyNeeded.toFixed(2)} ${babyCoinSymbol} to Boost APR by ${Math.round(percentageIncrease)}%`,
    [eligibility.additionalBabyNeeded, babyCoinSymbol, percentageIncrease],
  );

  // Don't render modal if boost data is not available
  if (!hasValidBoostData) {
    return null;
  }

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
      onSubmit={onSubmit}
      onClose={onClose}
      showCloseButton={true}
    >
      <p className="text-center text-base text-accent-secondary">
        Your current APR is{" "}
        <span className="text-accent-primary">{currentAPRDisplay}%</span>.
        Co-staking lets you earn more by pairing your {btcCoinSymbol} stake with{" "}
        {babyCoinSymbol}. Stake {eligibility.additionalBabyNeeded.toFixed(2)}{" "}
        {babyCoinSymbol} to boost your APR{" "}
        <span className="text-accent-primary">
          by {Math.round(percentageIncrease)}%
        </span>
        .
      </p>
    </SubmitModal>
  );
};
