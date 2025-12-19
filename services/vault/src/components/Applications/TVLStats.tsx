import { Loader } from "@babylonlabs-io/core-ui";

import type { StatsData } from "../../hooks/useStats";
import { formatBtcAmount, formatUsdValue } from "../../utils/formatting";

interface TVLStatProps {
  label: string;
  btcAmount: number;
  usdValue: number;
}

function TVLStat({ label, btcAmount, usdValue }: TVLStatProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[16px] font-normal text-accent-secondary">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-normal text-black dark:text-white">
          {formatBtcAmount(btcAmount, 2)}
        </span>
        <span className="text-[20px] font-normal text-accent-secondary">
          ({formatUsdValue(usdValue)})
        </span>
      </div>
    </div>
  );
}

interface TVLStatsProps {
  data: StatsData | null;
  isLoading?: boolean;
}

export function TVLStats({ data, isLoading }: TVLStatsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-secondary-strokeLight p-6 dark:bg-primary-main/50">
        <Loader size={24} />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-xl border border-secondary-strokeLight p-6 dark:bg-primary-main/50">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Total TBV TVL */}
        <TVLStat
          label="Total TBV TVL"
          btcAmount={data.totalTbvTvl.btcAmount}
          usdValue={data.totalTbvTvl.usdValue}
        />

        {/* Total TVL Collateral */}
        <div className="border-t border-secondary-strokeLight pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <TVLStat
            label="Total TVL Collateral"
            btcAmount={data.totalTvlCollateral.btcAmount}
            usdValue={data.totalTvlCollateral.usdValue}
          />
        </div>
      </div>
    </div>
  );
}
