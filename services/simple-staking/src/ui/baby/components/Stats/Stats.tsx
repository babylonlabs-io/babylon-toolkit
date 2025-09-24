import { List } from "@babylonlabs-io/core-ui";
import { memo, useMemo } from "react";

import { Section } from "@/ui/common/components/Section/Section";
import { StatItem, LoadingStyle } from "@/ui/common/components/Stats/StatItem";
import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { usePool } from "@/ui/baby/hooks/api/usePool";
import { useValidators } from "@/ui/baby/hooks/api/useValidators";
import { useAnnualProvisions } from "@/ui/baby/hooks/api/useAnnualProvisions";
import { useSupply } from "@/ui/baby/hooks/api/useSupply";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { useIncentiveParams } from "@/ui/baby/hooks/api/useIncentiveParams";

const { coinSymbol } = getNetworkConfigBBN();

const formatter = Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export const Stats = memo(() => {
  const { data: pool, isLoading: isPoolLoading } = usePool();
  const { data: validators = [], isLoading: isValidatorsLoading } =
    useValidators();
  const { data: annualProvisions = 0, isLoading: isAnnualProvisionsLoading } = useAnnualProvisions();
  const { isLoading: isSupplyLoading } = useSupply();
  const price = usePrice("BABY");
  const { data: incentiveParams } = useIncentiveParams({ enabled: true });

  const totalStakedBABY = useMemo(() => {
    const bonded = pool?.bondedTokens ?? 0;
    return ubbnToBaby(bonded);
  }, [pool]);

  const tvl = useMemo(() => {
    const amount = totalStakedBABY;
    const usd = price ? amount * price : undefined;
    return { amount, usd } as const;
  }, [totalStakedBABY, price]);

  const aprPct = useMemo(() => {
    if (!annualProvisions || !totalStakedBABY) {
      return null;
    }

    const hasIncentiveParams = incentiveParams &&
      incentiveParams.btcStakingPortion !== null &&
      incentiveParams.fpPortion !== null &&
      incentiveParams.validatorsPortion !== null &&
      incentiveParams.costakingPortion !== null;

    if (!hasIncentiveParams) {
      return null;
    }

    const btcStakingPortion = incentiveParams.btcStakingPortion!;
    const fpPortion = incentiveParams.fpPortion!;
    const validatorsPortion = incentiveParams.validatorsPortion!;
    const costakingPortion = incentiveParams.costakingPortion!;
    const portionsSum = btcStakingPortion + fpPortion + validatorsPortion + costakingPortion;
    const distributionPortion = Math.max(0, 1 - portionsSum);

    const totalTokens = validators.reduce((acc, v) => acc + Number(v.tokens ?? 0), 0);
    const weightedCommissionSum = validators.reduce(
      (acc, v) => acc + (Number(v.commission?.commissionRates?.rate ?? 0) * Number(v.tokens ?? 0)),
      0,
    );
    const avgCommission = totalTokens > 0 ? weightedCommissionSum / totalTokens : 0;
    const commissionFactor = Math.max(0, 1 - avgCommission);

    const annualRewardsToDistribution = annualProvisions * distributionPortion;
    const annualRewardsToDelegators = annualRewardsToDistribution * commissionFactor;
    const apr = annualRewardsToDelegators / (totalStakedBABY * 1_000_000);
    const result = apr * 100;
    return result;
  }, [annualProvisions, totalStakedBABY, incentiveParams, validators]);

  const statItems = useMemo(() => {
    const items = [
      <StatItem
        key="tvl"
        loading={isPoolLoading}
        title={`Total ${coinSymbol} TVL`}
        value={`${formatter.format(tvl.amount)} ${coinSymbol}`}
      />
    ];

    if (aprPct !== null) {
      items.push(
        <StatItem
          key="apr"
          loading={isPoolLoading || isSupplyLoading || isAnnualProvisionsLoading}
          title={`${coinSymbol} Staking APR`}
          value={`${formatter.format(aprPct)}%`}
          loadingStyle={LoadingStyle.ShowSpinnerAndValue}
        />
      );
    }

    items.push(
      <StatItem
        key="validators"
        loading={isValidatorsLoading}
        title={`Validators`}
        value={`${formatter.format(validators.length)}`}
      />
    );

    return items;
  }, [
    isPoolLoading,
    coinSymbol,
    tvl.amount,
    aprPct,
    isSupplyLoading,
    isAnnualProvisionsLoading,
    isValidatorsLoading,
    validators.length
  ]);

  return (
    <Section title="BABY Staking Stats">
      <List orientation="adaptive">
        {statItems}
      </List>
    </Section>
  );
});

Stats.displayName = "BabyStats";
