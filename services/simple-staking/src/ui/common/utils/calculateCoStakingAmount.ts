import type { PersonalizedAPRResponse } from "@/ui/common/types/api/coStaking";

import { maxDecimals } from "./maxDecimals";

const MAX_DECIMALS = 6;

/**
 * Calculate co-staking amount split from BTC rewards using API APR ratios
 *
 * Splits BTC rewards into:
 * - Base BTC staking rewards
 * - Co-staking bonus rewards
 *
 * @param btcRewardBaby - Total BTC rewards in BABY
 * @param rawAprData - APR data from API containing co_staking_apr, btc_staking_apr, total_apr
 * @returns Object with coStakingAmountBaby and baseBtcRewardBaby
 */
export function calculateCoStakingAmount(
  btcRewardBaby: number,
  rawAprData: PersonalizedAPRResponse["data"] | null,
): { coStakingAmountBaby: number; baseBtcRewardBaby: number } {
  // If co-staking APR data not available, return base values
  if (!rawAprData || !rawAprData.current) {
    return {
      coStakingAmountBaby: 0,
      baseBtcRewardBaby: btcRewardBaby,
    };
  }

  const { co_staking_apr, btc_staking_apr, total_apr } = rawAprData.current;

  // If no co-staking APR, all BTC rewards are base BTC rewards
  // Guard against division by zero and invalid numbers
  if (
    co_staking_apr === 0 ||
    total_apr === 0 ||
    !Number.isFinite(total_apr) ||
    total_apr < 0
  ) {
    return {
      coStakingAmountBaby: 0,
      baseBtcRewardBaby: btcRewardBaby,
    };
  }

  // Calculate split based on APR ratios from API
  const coStakingRatio = co_staking_apr / total_apr;
  const btcStakingRatio = btc_staking_apr / total_apr;

  const coStakingAmount = maxDecimals(
    btcRewardBaby * coStakingRatio,
    MAX_DECIMALS,
  );
  const baseBtcAmount = maxDecimals(
    btcRewardBaby * btcStakingRatio,
    MAX_DECIMALS,
  );

  return {
    coStakingAmountBaby: coStakingAmount,
    baseBtcRewardBaby: baseBtcAmount,
  };
}
