import { useMemo, useCallback } from "react";
import { MdRocketLaunch } from "react-icons/md";
import { useSessionStorage } from "usehooks-ts";
import { useNavigate } from "react-router";
import { Text, DismissibleSubSection } from "@babylonlabs-io/core-ui";

import { useCoStakingState } from "@/ui/common/state/CoStakingState";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { formatBalance } from "@/ui/common/utils/formatCryptoBalance";
import {
  AnalyticsCategory,
  AnalyticsMessage,
  trackEvent,
} from "@/ui/common/utils/analytics";

import type { TabId } from "../../layout";

export function CoStakingBoostSection({
  setActiveTab,
}: {
  setActiveTab: (tab: TabId) => void;
}) {
  const {
    eligibility,
    hasValidBoostData,
    isLoading: isCoStakingLoading,
  } = useCoStakingState();
  const { coinSymbol: babyCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const [showCoStakingBoostSection, setShowCoStakingBoostSection] =
    useSessionStorage<boolean>("co-staking-boost-section-visibility", true, {
      initializeWithValue: true,
    });
  const navigate = useNavigate();

  const handlePrefill = () => {
    trackEvent(
      AnalyticsCategory.CTA_CLICK,
      AnalyticsMessage.PREFILL_COSTAKING_AMOUNT,
      {
        component: "CoStakingBoostSection",
        babyAmount: eligibility.additionalBabyNeeded,
      },
    );
    setActiveTab("stake");
    navigate("/baby", {
      state: {
        shouldPrefillCoStaking: true,
      },
    });
  };

  const handleClose = useCallback(() => {
    trackEvent(
      AnalyticsCategory.CTA_CLICK,
      AnalyticsMessage.DISMISS_COSTAKING_PREFILL_CTA,
      {
        component: "CoStakingBoostSection",
      },
    );
    setShowCoStakingBoostSection(false);
  }, [setShowCoStakingBoostSection]);

  const formattedSuggestedAmount = useMemo(
    () => formatBalance(eligibility.additionalBabyNeeded || 0, babyCoinSymbol),
    [eligibility.additionalBabyNeeded, babyCoinSymbol],
  );

  const shouldShowCoStakingBoostSection =
    !isCoStakingLoading && showCoStakingBoostSection && hasValidBoostData;

  return (
    shouldShowCoStakingBoostSection && (
      <DismissibleSubSection
        icon={<MdRocketLaunch size={24} className="min-w-6 text-info-light" />}
        title={`Boost Your ${btcCoinSymbol} Staking Rewards`}
        content={
          <Text variant="body1" className="text-accent-secondary">
            Stake{" "}
            <button
              type="button"
              onClick={handlePrefill}
              className="text-info-light hover:underline"
            >
              {formattedSuggestedAmount}
            </button>{" "}
            to boost your {btcCoinSymbol} rewards. The more {babyCoinSymbol} you
            stake, the more of your {btcCoinSymbol} becomes eligible for bonus
            rewards. Start co-staking to unlock higher returns.
          </Text>
        }
        onCloseClick={handleClose}
      />
    )
  );
}

export default CoStakingBoostSection;
