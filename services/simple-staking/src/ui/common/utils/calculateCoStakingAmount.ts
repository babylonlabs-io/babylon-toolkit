import { maxDecimals } from "./maxDecimals";

const MAX_DECIMALS = 6;

/**
 * Calculate co-staking amount from total BTC rewards using pool-share APR ratio
 *
 * Splits BTC rewards into:
 * - Base BTC staking rewards
 * - Co-staking bonus rewards
 *
 * @param btcRewardBaby - Total BTC rewards in BABY
 * @param userScore - User's total score from rewards tracker
 * @param globalScore - Global total score from current rewards
 * @param activeBabyUbbn - User's active BABY in ubbn
 * @param rewardSupply - Annual co-staking reward supply in ubbn
 * @param btcApr - BTC staking APR percentage
 * @returns Object with coStakingAmount and baseBtcAmount, or null if calculation not possible
 */
export function calculateCoStakingAmount(
  btcRewardBaby: number,
  userScore: string | undefined,
  globalScore: string | undefined,
  activeBabyUbbn: string | undefined,
  rewardSupply: number | null | undefined,
  btcApr: number | undefined,
): { coStakingAmount: number; baseBtcAmount: number } | null {
  if (!userScore || !globalScore || !activeBabyUbbn) return null;

  if (!rewardSupply || !btcApr) return null;

  const userScoreNum = Number(userScore);
  const globalScoreNum = Number(globalScore);
  const activeBabyNum = Number(activeBabyUbbn);

  if (globalScoreNum <= 0 || activeBabyNum <= 0 || userScoreNum <= 0)
    return null;

  const poolShare = userScoreNum / globalScoreNum;
  const userAnnualRewardsUbbn = poolShare * rewardSupply;
  const userCoStakingApr = (userAnnualRewardsUbbn / activeBabyNum) * 100;
  const denominator = btcApr + userCoStakingApr;

  if (denominator <= 0) return null;

  const coStakingRatio = userCoStakingApr / denominator;
  const rawCoStakingBaby = btcRewardBaby * coStakingRatio;
  const clampedCoStakingBaby = Math.max(
    0,
    Math.min(btcRewardBaby, rawCoStakingBaby),
  );

  const coStakingAmount = maxDecimals(clampedCoStakingBaby, MAX_DECIMALS);
  const baseBtcAmount = maxDecimals(
    btcRewardBaby - coStakingAmount,
    MAX_DECIMALS,
  );

  return { coStakingAmount, baseBtcAmount };
}
