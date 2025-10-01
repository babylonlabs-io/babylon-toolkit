import { TopBanner } from "@babylonlabs-io/core-ui";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useSessionStorage } from "usehooks-ts";
import { MdRocketLaunch } from "react-icons/md";

import { useBalanceState } from "@/ui/common/state/BalanceState";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";

const BANNER_DISMISSED_KEY = "bbn-costaking-banner-dismissed";

export const CoStakingBanner = () => {
  const navigate = useNavigate();
  const { stakedBtcBalance } = useBalanceState();
  const [dismissed, setDismissed] = useSessionStorage(
    BANNER_DISMISSED_KEY,
    false,
  );
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();

  // Only show banner if:
  // 1. User has active BTC delegations (stakedBtcBalance > 0)
  // 2. User hasn't dismissed the banner
  const hasActiveDelegations = stakedBtcBalance > 0;
  const shouldShowBanner = hasActiveDelegations && !dismissed;

  const handleBannerClick = useCallback(() => {
    navigate("/baby");
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
