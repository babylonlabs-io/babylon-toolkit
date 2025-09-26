import { useMemo } from "react";

import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { ubbnToBaby, MICRO_BABY_PER_BABY } from "@/ui/common/utils/bbn";
import { usePool } from "@/ui/baby/hooks/api/usePool";
import { useValidators } from "@/ui/baby/hooks/api/useValidators";
import { useAnnualProvisions } from "@/ui/baby/hooks/api/useAnnualProvisions";
import { useSupply } from "@/ui/baby/hooks/api/useSupply";
import { useIncentiveParams } from "@/ui/baby/hooks/api/useIncentiveParams";

export interface StatsCalculations {
  totalStakedBABY: number;
  tvl: {
    amount: number;
    usd: number | undefined;
  };
  aprPct: number | null;
  isLoading: boolean;
  validatorCount: number;
}

export const useStatsCalculations = (): StatsCalculations => {
  const { data: pool, isLoading: isPoolLoading } = usePool();
  const { data: validators = [], isLoading: isValidatorsLoading } =
    useValidators();
  const { data: annualProvisions = 0, isLoading: isAnnualProvisionsLoading } =
    useAnnualProvisions();
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

    const hasBasicParams =
      incentiveParams && incentiveParams.btcStakingPortion !== null;

    if (!hasBasicParams) {
      return null;
    }

    const btcStakingPortion = incentiveParams.btcStakingPortion ?? 0;
    const fpPortion = incentiveParams.fpPortion ?? 0;
    const validatorsPortion = incentiveParams.validatorsPortion ?? 0;
    const costakingPortion = incentiveParams.costakingPortion ?? 0;

    const totalPortions =
      btcStakingPortion + fpPortion + validatorsPortion + costakingPortion;
    const distributionPortion = Math.max(0, 1 - totalPortions);

    const totalTokens = validators.reduce(
      (acc, v) => acc + Number(v.tokens ?? 0),
      0,
    );
    const weightedCommissionSum = validators.reduce(
      (acc, v) =>
        acc +
        Number(v.commission?.commissionRates?.rate ?? 0) *
          Number(v.tokens ?? 0),
      0,
    );
    const avgCommission =
      totalTokens > 0 ? weightedCommissionSum / totalTokens : 0;
    const commissionFactor = Math.max(0, 1 - avgCommission);

    const totalRewards = annualProvisions;
    const annualRewardsToDistribution = totalRewards * distributionPortion;
    const annualRewardsToDelegators =
      annualRewardsToDistribution * commissionFactor;
    const annualRewardsToDelegatorsInBABY =
      annualRewardsToDelegators / MICRO_BABY_PER_BABY;
    const apr = annualRewardsToDelegatorsInBABY / totalStakedBABY;
    const result = apr * 100;

    return result;
  }, [annualProvisions, totalStakedBABY, incentiveParams, validators]);

  const isLoading =
    isPoolLoading ||
    isValidatorsLoading ||
    isAnnualProvisionsLoading ||
    isSupplyLoading;

  return useMemo(
    () => ({
      totalStakedBABY,
      tvl,
      aprPct,
      isLoading,
      validatorCount: validators.length,
    }),
    [totalStakedBABY, tvl, aprPct, isLoading, validators.length],
  );
};
