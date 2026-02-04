import { Loader } from "@babylonlabs-io/core-ui";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";

import type { StatsData } from "../../hooks/useStats";
import { formatBtcAmount, formatUsdValue } from "../../utils/formatting";
import { PriceWarningBanner } from "../shared";

interface TVLStatsProps {
  data: StatsData | null;
  isLoading?: boolean;
  priceMetadata?: Record<string, PriceMetadata>;
  hasStalePrices?: boolean;
  hasPriceFetchError?: boolean;
}

export function TVLStats({
  data,
  isLoading,
  priceMetadata = {},
  hasStalePrices = false,
  hasPriceFetchError = false,
}: TVLStatsProps) {
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

  const showPriceWarning = hasStalePrices || hasPriceFetchError;

  return (
    <div className="flex flex-col gap-4">
      {showPriceWarning && (
        <PriceWarningBanner
          metadata={priceMetadata}
          hasPriceFetchError={hasPriceFetchError}
          hasStalePrices={hasStalePrices}
        />
      )}
      <div className="rounded-xl border border-secondary-strokeLight p-6 dark:bg-primary-main/50">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* TVL */}
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-normal text-accent-secondary">
              TVL
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-[20px] font-normal text-black dark:text-white">
                {formatBtcAmount(data.tvlBtc, 3)}
              </span>
              {!hasPriceFetchError && (
                <span className="text-[20px] font-normal text-accent-secondary">
                  ({formatUsdValue(data.tvlUsd)})
                </span>
              )}
            </div>
          </div>

          {/* Vaults */}
          <div className="border-t border-secondary-strokeLight pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <div className="flex flex-col gap-2">
              <span className="text-[16px] font-normal text-accent-secondary">
                Vaults
              </span>
              <span className="text-[20px] font-normal text-black dark:text-white">
                {data.vaultCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
