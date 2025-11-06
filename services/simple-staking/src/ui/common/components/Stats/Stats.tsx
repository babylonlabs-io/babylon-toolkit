import { List } from "@babylonlabs-io/core-ui";
import { memo } from "react";

import { Section } from "@/ui/common/components/Section/Section";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { useSystemStats } from "@/ui/common/hooks/client/api/useSystemStats";
import { useGlobalAPR } from "@/ui/common/hooks/client/api/useGlobalAPR";
import { Network } from "@/ui/common/types/network";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { formatBTCTvl } from "@/ui/common/utils/formatBTCTvl";
import { formatAPRPercentage } from "@/ui/common/utils/formatAPR";

import { StatItem } from "./StatItem";

const { coinSymbol, network } = getNetworkConfigBTC();

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export const Stats = memo(() => {
  const {
    data: {
      total_active_tvl: totalActiveTVL = 0,
      active_finality_providers: activeFPs = 0,
      total_finality_providers: totalFPs = 0,
    } = {},
    isLoading,
  } = useSystemStats();
  const { data: aprData, isLoading: isAPRLoading } = useGlobalAPR();
  const usdRate = usePrice(coinSymbol);

  return (
    <Section title="Babylon Bitcoin Staking Stats">
      <List orientation="adaptive">
        <StatItem
          loading={isLoading}
          title={`Total ${coinSymbol} TVL`}
          value={formatBTCTvl(
            satoshiToBtc(totalActiveTVL),
            coinSymbol,
            usdRate,
          )}
        />

        <StatItem
          hidden={network === Network.MAINNET ? !aprData : false}
          loading={isLoading || isAPRLoading}
          title={`${coinSymbol} Staking APR`}
          value={
            network === Network.MAINNET && aprData
              ? `${formatAPRPercentage(aprData.btcStakingApr * 100)}% - ${formatAPRPercentage(aprData.maxStakingApr * 100)}%`
              : "0%"
          }
          tooltip={
            <>
              <p>
                BTC Staking APR is higher if you co-stake BTC and BABY, hence
                the two numbers shown.
              </p>
              <p>
                The first number is the BTC Staking APR if you only stake BTC -
                you receive a share of the 1% inflation.
              </p>
              <p>
                The second number is the BTC Staking APR if you co-stake BTC and
                BABY.
              </p>
              <p>
                Annual Percentage Reward (APR) is a dynamic estimate of the
                annualized staking reward rate based on current network
                conditions, and it refers to staking rewards rather than
                traditional lending interest. Rewards are distributed in BABY
                tokens but shown as a Bitcoin-equivalent rate relative to the
                Bitcoin initially staked. APR is calculated using U.S. dollar
                values for Bitcoin and BABY from independent, reputable sources.
                The APR shown is an approximate figure that can fluctuate, and
                the displayed value may not always be completely accurate.
                Actual rewards are not guaranteed and may vary over time.
                Staking carries exposure to slashing and other risks.
              </p>
            </>
          }
        />

        <StatItem
          loading={isLoading}
          title="Finality Providers"
          value={`${formatter.format(activeFPs)} Active (${formatter.format(totalFPs)} Total)`}
        />
      </List>
    </Section>
  );
});

Stats.displayName = "Stats";
