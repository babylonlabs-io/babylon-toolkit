import { useCallback, useEffect, useMemo, useRef } from "react";

import { getNetworkConfigBTC } from "../../config/network/btc";
import { getNetworkConfigBBN } from "../../config/network/bbn";
import { useCoStakingState } from "../../state/CoStakingState";
import { formatAPRPercentage } from "../../utils/formatAPR";
import {
  AnalyticsCategory,
  AnalyticsMessage,
  trackEvent,
  trackViewTime,
} from "../../utils/analytics";

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

  const currentAPRDisplay = useMemo(
    () => formatAPRPercentage(aprData.currentApr),
    [aprData.currentApr],
  );

  const percentageIncrease = useMemo(() => {
    const current = aprData.currentApr ?? 0;
    const boost = aprData.boostApr ?? 0;
    if (current <= 0 || boost <= current) return 0;
    return ((boost - current) / current) * 100;
  }, [aprData.currentApr, aprData.boostApr]);

  const boostPercentDisplay = useMemo(() => {
    return percentageIncrease < 1
      ? percentageIncrease.toFixed(1)
      : Math.round(percentageIncrease).toString();
  }, [percentageIncrease]);

  const submitButtonText = useMemo(
    () =>
      `Stake ${eligibility.additionalBabyNeeded.toFixed(2)} ${babyCoinSymbol} to Boost APR by ${boostPercentDisplay}%`,
    [eligibility.additionalBabyNeeded, babyCoinSymbol, boostPercentDisplay],
  );

  // Keep latest values for tracking without retriggering the tracking effect
  const latestTrackingDataRef = useRef({
    modalName: "CoStakingBoostModal",
    babyAmount: eligibility.additionalBabyNeeded,
    aprBoostPercent: percentageIncrease,
    currentApr: aprData.currentApr,
    boostApr: aprData.boostApr,
  });

  // Update ref whenever the underlying values change; the tracking effect itself
  // still only depends on `open`, so it doesn't retrigger.
  useEffect(() => {
    latestTrackingDataRef.current = {
      modalName: "CoStakingBoostModal",
      babyAmount: eligibility.additionalBabyNeeded,
      aprBoostPercent: percentageIncrease,
      currentApr: aprData.currentApr,
      boostApr: aprData.boostApr,
    };
  }, [
    eligibility.additionalBabyNeeded,
    percentageIncrease,
    aprData.currentApr,
    aprData.boostApr,
  ]);

  // Track modal view duration using the ref so cleanup logs the latest metrics,
  // while only reacting to `open` changes.
  useEffect(() => {
    if (!open) return;

    const stopTracking = trackViewTime(
      AnalyticsCategory.MODAL_VIEW,
      AnalyticsMessage.MODAL_VIEWED,
      latestTrackingDataRef,
    );
    return () => {
      stopTracking();
    };
  }, [open]);

  const handleSubmit = useCallback(() => {
    trackEvent(
      AnalyticsCategory.CTA_CLICK,
      AnalyticsMessage.PREFILL_COSTAKING_AMOUNT,
      {
        component: "CoStakingBoostModal",
        babyAmount: eligibility.additionalBabyNeeded,
        aprBoostPercent: percentageIncrease,
        currentApr: aprData.currentApr,
        boostApr: aprData.boostApr,
      },
    );
    onSubmit();
  }, [
    onSubmit,
    eligibility.additionalBabyNeeded,
    percentageIncrease,
    aprData.currentApr,
    aprData.boostApr,
  ]);

  const handleClose = useCallback(() => {
    trackEvent(AnalyticsCategory.CTA_CLICK, AnalyticsMessage.CLOSE_MODAL, {
      modalName: "CoStakingBoostModal",
    });
    onClose();
  }, [onClose]);

  // Don't render modal if boost data is not available
  if (!hasValidBoostData) {
    return null;
  }

  return (
    <SubmitModal
      icon={
        <img
          src="/images/mascot-head-happy.png"
          alt="Mascot head happy illustration"
          className="mb-10 h-full w-full object-cover"
        />
      }
      iconParentClassName="h-40 w-80 bg-transparent" // Safelisted in tailwind.config.ts
      title="Boost your BTC staking rewards"
      open={open}
      submitButton={submitButtonText}
      cancelButton=""
      onSubmit={handleSubmit}
      onClose={handleClose}
      showCloseButton={true}
    >
      <p className="text-center text-base text-accent-secondary">
        Your current APR is{" "}
        <span className="text-accent-primary">{currentAPRDisplay}%</span>.
        Co-staking lets you earn more by pairing your {btcCoinSymbol} stake with{" "}
        {babyCoinSymbol}. Stake {eligibility.additionalBabyNeeded.toFixed(2)}{" "}
        {babyCoinSymbol} to boost your APR{" "}
        <span className="text-accent-primary">by {boostPercentDisplay}%</span>.
      </p>
    </SubmitModal>
  );
};
