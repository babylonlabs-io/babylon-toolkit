import { List } from "@babylonlabs-io/core-ui";
import { memo, useMemo } from "react";

import { Section } from "@/ui/common/components/Section/Section";
import { StatItem, LoadingStyle } from "@/ui/common/components/Stats/StatItem";
import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { usePool } from "@/ui/baby/hooks/api/usePool";
import { useValidators } from "@/ui/baby/hooks/api/useValidators";
import { useInflation } from "@/ui/baby/hooks/api/useInflation";
import { useSupply } from "@/ui/baby/hooks/api/useSupply";
import { ubbnToBaby } from "@/ui/common/utils/bbn";

const { coinSymbol } = getNetworkConfigBBN();

const formatter = Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
});

export const Stats = memo(() => {
    const { data: pool, isLoading: isPoolLoading } = usePool();
    const { data: validators = [], isLoading: isValidatorsLoading } =
        useValidators();
    const { data: inflation = 0, isLoading: isInflationLoading } = useInflation();
    const { data: supply = 0n, isLoading: isSupplyLoading } = useSupply();
    const price = usePrice("BABY");

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
        const circulatingSupply = Number(supply);
        if (!circulatingSupply || !totalStakedBABY || !inflation) return 0;
        const annualRewards = inflation * circulatingSupply;
        const apr = annualRewards / (totalStakedBABY * 1_000_000);
        return apr * 100;
    }, [inflation, supply, totalStakedBABY]);

    return (
        <Section title="BABY Staking Stats">
            <List orientation="adaptive">
                <StatItem
                    loading={isPoolLoading}
                    title={`Total ${coinSymbol} TVL`}
                    value={`${formatter.format(tvl.amount)} ${coinSymbol}`}
                    suffix={
                        price ? (
                            <span>({formatter.format(tvl.usd ?? 0)} USD)</span>
                        ) : undefined
                    }
                />
                <StatItem
                    loading={isPoolLoading || isSupplyLoading || isInflationLoading}
                    title={`${coinSymbol} Staking APR`}
                    value={`${formatter.format(aprPct)}%`}
                    loadingStyle={LoadingStyle.ShowSpinnerAndValue}
                />
                <StatItem
                    loading={isValidatorsLoading}
                    title={`Validators`}
                    value={`${formatter.format(validators.length)}`}
                />
            </List>
        </Section>
    );
});

Stats.displayName = "BabyStats";
