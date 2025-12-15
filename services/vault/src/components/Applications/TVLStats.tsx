interface TVLStatProps {
  label: string;
  btcAmount: string;
  usdValue: string;
}

function TVLStat({ label, btcAmount, usdValue }: TVLStatProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[16px] font-normal text-accent-secondary">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-normal text-black dark:text-white">
          {btcAmount}
        </span>
        <span className="text-[20px] font-normal text-accent-secondary">
          ({usdValue})
        </span>
      </div>
    </div>
  );
}

export interface TVLStatsData {
  totalTbvTvl: {
    btcAmount: string;
    usdValue: string;
  };
  totalTvlCollateral: {
    btcAmount: string;
    usdValue: string;
  };
}

interface TVLStatsProps {
  data: TVLStatsData;
}

export function TVLStats({ data }: TVLStatsProps) {
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

// Mock data
export const MOCK_TVL_STATS: TVLStatsData = {
  totalTbvTvl: {
    btcAmount: "12000 BTC",
    usdValue: "$349,823,417",
  },
  totalTvlCollateral: {
    btcAmount: "7000 BTC",
    usdValue: "$110,234,21",
  },
};
