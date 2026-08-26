import { List } from "@babylonlabs-io/core-ui";
import { memo, useMemo } from "react";

import { Section } from "@/ui/common/components/Section/Section";
import { StatItem, LoadingStyle } from "@/ui/common/components/Stats/StatItem";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { useStatsCalculations } from "@/ui/baby/hooks/useStatsCalculations";

const { coinSymbol } = getNetworkConfigBBN();

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export const Stats = memo(() => {
  const { tvl, aprPct, validatorCount, isLoading } = useStatsCalculations();

  const statItems = useMemo(() => {
    const items = [
      <StatItem
        key="tvl"
        loading={isLoading}
        title={`Total ${coinSymbol} TVL`}
        value={`${formatter.format(tvl.amount)} ${coinSymbol}`}
      />,
    ];

    if (aprPct !== null) {
      items.push(
        <StatItem
          key="apr"
          loading={isLoading}
          title={`${coinSymbol} Staking APR`}
          value={`${formatter.format(aprPct)}%`}
          loadingStyle={LoadingStyle.ShowSpinnerAndValue}
        />,
      );
    }

    items.push(
      <StatItem
        key="validators"
        loading={isLoading}
        title={`Validators`}
        value={`${formatter.format(validatorCount)}`}
      />,
    );

    return items;
  }, [tvl.amount, aprPct, validatorCount, isLoading]);

  return (
    <Section title="BABY Staking Stats">
      <List orientation="adaptive">{statItems}</List>
    </Section>
  );
});

Stats.displayName = "BabyStats";
