import { useMemo } from "react";
import { MdRocketLaunch } from "react-icons/md";
import { useSessionStorage } from "usehooks-ts";
import { SubSection, Text, CloseIcon } from "@babylonlabs-io/core-ui";

import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import { DelegationV2StakingState } from "@/ui/common/types/delegationsV2";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

import type { TabId } from "../../layout";

const CO_STAKING_REQUIRED_AMOUNT_BABY = 100000; // 100k BABY

export function CoStakingBoostSection({
  setActiveTab,
}: {
  setActiveTab: (tab: TabId) => void;
}) {
  const { delegations = [], isLoading } = useDelegationV2State();
  const { coinSymbol: babyCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();
  const [showCoStakingBoostSection, setShowCoStakingBoostSection] =
    useSessionStorage<boolean>("co-staking-boost-section-visibility", true, {
      initializeWithValue: true,
    });

  const hasActiveBtcDelegations = useMemo(
    () => delegations.some((d) => d.state === DelegationV2StakingState.ACTIVE),
    [delegations],
  );

  const handlePrefill = () => {
    setActiveTab("stake");
    // TODO: update the form input value by using document.querySelector or by passing the ref to the AmountField → StakingForm → layout → CoStakingBoostSection
  };

  return (
    hasActiveBtcDelegations &&
    !isLoading &&
    showCoStakingBoostSection && (
      <SubSection className="flex gap-3">
        <MdRocketLaunch size={24} className="min-w-6 text-info-light" />
        <div className="flex flex-col gap-1">
          <Text variant="subtitle1" className="text-accent-primary">
            Boost Your BTC Staking Rewards
          </Text>

          <Text variant="body1" className="text-accent-secondary">
            Stake {""}
            <button
              type="button"
              onClick={handlePrefill}
              className="text-info-light hover:underline"
            >
              {CO_STAKING_REQUIRED_AMOUNT_BABY.toLocaleString()}
            </button>{" "}
            {babyCoinSymbol} to boost your {btcCoinSymbol} rewards. The more{" "}
            {babyCoinSymbol} you stake, the more of your {btcCoinSymbol} becomes{" "}
            eligible for bonus rewards. Start co-staking to unlock higher{" "}
            returns.
          </Text>
        </div>
        <div
          className="cursor-pointer"
          aria-label="Dismiss co-staking boost section"
          onClick={() => setShowCoStakingBoostSection(false)}
        >
          <CloseIcon size={14} variant="accent-primary"></CloseIcon>
        </div>
      </SubSection>
    )
  );
}

export default CoStakingBoostSection;
