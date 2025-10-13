import { useMemo } from "react";
import { MdRocketLaunch } from "react-icons/md";
import { useSessionStorage } from "usehooks-ts";
import { useNavigate } from "react-router";
import { Text, DismissibleSubSection } from "@babylonlabs-io/core-ui";

import { useCoStakingState } from "@/ui/common/state/CoStakingState";
import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import { DelegationV2StakingState } from "@/ui/common/types/delegationsV2";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { formatBalance } from "@/ui/common/utils/formatCryptoBalance";

import type { TabId } from "../../layout";

export function CoStakingBoostSection({
  setActiveTab,
}: {
  setActiveTab: (tab: TabId) => void;
}) {
  const { delegations = [], isLoading } = useDelegationV2State();
  const {
    eligibility,
    hasValidBoostData,
    isEnabled: isCoStakingEnabled,
    isLoading: isCoStakingLoading,
  } = useCoStakingState();
  const { coinSymbol: babyCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const [showCoStakingBoostSection, setShowCoStakingBoostSection] =
    useSessionStorage<boolean>("co-staking-boost-section-visibility", true, {
      initializeWithValue: true,
    });
  const navigate = useNavigate();

  const hasActiveBtcDelegations = useMemo(
    () => delegations.some((d) => d.state === DelegationV2StakingState.ACTIVE),
    [delegations],
  );

  const handlePrefill = () => {
    setActiveTab("stake");
    navigate("/baby", {
      state: {
        shouldPrefillCoStaking: true,
      },
    });
  };

  const formattedSuggestedAmount = useMemo(
    () => formatBalance(eligibility.additionalBabyNeeded || 0, babyCoinSymbol),
    [eligibility.additionalBabyNeeded, babyCoinSymbol],
  );

  const shouldShowCoStakingBoostSection =
    isCoStakingEnabled &&
    hasActiveBtcDelegations &&
    !isLoading &&
    !isCoStakingLoading &&
    showCoStakingBoostSection &&
    hasValidBoostData;

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
        onCloseClick={() => setShowCoStakingBoostSection(false)}
      />
    )
  );
}

export default CoStakingBoostSection;
