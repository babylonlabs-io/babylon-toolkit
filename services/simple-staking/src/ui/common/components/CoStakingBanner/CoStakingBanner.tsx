import { TopBanner } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useSessionStorage } from "usehooks-ts";
import { MdRocketLaunch } from "react-icons/md";

import { useBalanceState } from "@/ui/common/state/BalanceState";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import {
  NAVIGATION_STATE_KEYS,
  type NavigationState,
} from "@/ui/common/constants/navigation";
import { useCoStakingState } from "@/ui/common/state/CoStakingState";

const BANNER_DISMISSED_KEY = "bbn-costaking-banner-dismissed";

export const CoStakingBanner = () => {
  const navigate = useNavigate();
  const { stakedBtcBalance } = useBalanceState();
  const { hasValidBoostData } = useCoStakingState();
  const [dismissed, setDismissed] = useSessionStorage(
    BANNER_DISMISSED_KEY,
    false,
  );
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();

  // Only show banner if:
  // 1. User has active BTC delegations (stakedBtcBalance > 0)
  // 2. User hasn't dismissed the banner
  // 3. Boost data is available (APR values are valid and additionalBabyNeeded > 0)
  const hasActiveDelegations = stakedBtcBalance > 0;
  const shouldShowBanner =
    hasActiveDelegations && !dismissed && hasValidBoostData;

  const handleBannerClick = useCallback(() => {
    navigate("/baby", {
      state: {
        [NAVIGATION_STATE_KEYS.PREFILL_COSTAKING]: true,
      } satisfies NavigationState,
    });
  }, [navigate]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, [setDismissed]);

  return (
    <TopBanner
      visible={shouldShowBanner}
      message={`Boost Your ${btcCoinSymbol} Staking Rewards`}
      onClick={handleBannerClick}
      onDismiss={handleDismiss}
      className="bg-gradient-to-b from-neutral-200 to-transparent dark:from-[#13323F]"
      icon={
        <MdRocketLaunch
          size={24}
          className="flex-shrink-0 text-info-light"
          aria-hidden="true"
        />
      }
    />
  );
};
