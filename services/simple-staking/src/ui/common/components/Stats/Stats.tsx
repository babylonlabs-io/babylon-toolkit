import { List, Button } from "@babylonlabs-io/core-ui";
import { memo } from "react";
import { useNavigate } from "react-router";

import { Section } from "@/ui/common/components/Section/Section";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { useSystemStats } from "@/ui/common/hooks/client/api/useSystemStats";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { formatBTCTvl } from "@/ui/common/utils/formatBTCTvl";
import { formatAPRPairAdaptive } from "@/ui/common/utils/formatAPR";

import { StatItem } from "./StatItem";

const { coinSymbol } = getNetworkConfigBTC();

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export const Stats = memo(() => {
  const navigate = useNavigate();
  const {
    data: {
      total_active_tvl: totalActiveTVL = 0,
      active_finality_providers: activeFPs = 0,
      total_finality_providers: totalFPs = 0,
      btc_staking_apr: btcStakingAPR,
      max_staking_apr: maxStakingAPR,
    } = {},
    isLoading,
  } = useSystemStats();
  const usdRate = usePrice(coinSymbol);

  return (
    <Section title="Babylon Bitcoin Staking Stats" className="relative">
      <Button
        variant="outlined"
        className="right-0 top-0 md:absolute"
        onClick={() => navigate("/calculator")}
      >
        Co-staking APR Calculator
      </Button>
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

        {maxStakingAPR !== undefined ? (
          <StatItem
            hidden={!btcStakingAPR || !maxStakingAPR}
            loading={isLoading}
            title={`${coinSymbol} Staking APR`}
            value={
              btcStakingAPR && maxStakingAPR
                ? (() => {
                    const { a, b } = formatAPRPairAdaptive(
                      btcStakingAPR * 100,
                      maxStakingAPR * 100,
                    );
                    return `${a}% - ${b}%`;
                  })()
                : "0%"
            }
            tooltip={
              <>
                <p>
                  {coinSymbol} Staking APR is higher if you co-stake{" "}
                  {coinSymbol} and BABY, hence the two numbers shown.
                </p>
                <p>
                  The first number is the {coinSymbol} Staking APR if you only
                  stake {coinSymbol} - you receive a share of the 1% inflation.
                </p>
                <p>
                  The second number is the {coinSymbol} Staking APR if you
                  co-stake {coinSymbol} and BABY.
                </p>
                <p>
                  Annual Percentage Reward (APR) is a dynamic estimate of the
                  annualized staking reward rate based on current network
                  conditions, and it refers to staking rewards rather than
                  traditional lending interest. Rewards are distributed in BABY
                  tokens but shown as a Bitcoin-equivalent rate relative to the
                  Bitcoin initially staked. APR is calculated using U.S. dollar
                  values for Bitcoin and BABY from independent, reputable
                  sources. The APR shown is an approximate figure that can
                  fluctuate, and the displayed value may not always be
                  completely accurate. Actual rewards are not guaranteed and may
                  vary over time. Staking carries exposure to slashing and other
                  risks.
                </p>
              </>
            }
          />
        ) : (
          <StatItem
            hidden={!btcStakingAPR}
            loading={isLoading}
            title={`${coinSymbol} Staking APR`}
            value={`${formatter.format(btcStakingAPR ? btcStakingAPR * 100 : 0)}%`}
            tooltip="Annual Percentage Reward (APR) is a dynamic estimate of the annualized staking reward rate based on current network conditions, and it refers to staking rewards rather than traditional lending interest. Rewards are distributed in BABY tokens but shown as a Bitcoin-equivalent rate relative to the Bitcoin initially staked. APR is calculated using U.S. dollar values for Bitcoin and BABY from independent, reputable sources. The APR shown is an approximate figure that can fluctuate, and the displayed value may not always be completely accurate. Actual rewards are not guaranteed and may vary over time. Staking carries exposure to slashing and other risks."
          />
        )}

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
