/**
 * Calculates the BTC eligibility percentage for co-staking rewards
 * Formula: min(active_satoshis, active_baby/score_ratio) / active_satoshis * 100
 *
 * @param activeSatoshis
 * @param activeBaby
 * @param scoreRatio
 */
export const calculateBTCEligibilityPercentage = (
  activeSatoshis: number,
  activeBaby: number,
  scoreRatio: number,
): number => {
  if (activeSatoshis === 0) return 0;
  if (scoreRatio === 0) return 0;

  const eligibleSats = Math.min(activeSatoshis, activeBaby / scoreRatio);
  return (eligibleSats / activeSatoshis) * 100;
};

/**
 * Calculates the required ubbn for full BTC co-staking rewards
 * Based on satoshis * scoreRatio formula
 */
export const calculateRequiredBabyTokens = (
  satoshisAmount: number,
  scoreRatio: number,
): number => {
  // Score ratio is in uBBN per sat
  const requiredUbbn = satoshisAmount * scoreRatio;
  return requiredUbbn;
};

/**
 * Calculates additional ubbn needed for full co-staking rewards
 */
export const calculateAdditionalBabyNeeded = (
  activeSatoshis: number,
  currentUbbnStaked: number,
  scoreRatio: number,
): number => {
  const requiredUbbn = calculateRequiredBabyTokens(activeSatoshis, scoreRatio);
  const additionalNeeded = Math.max(0, requiredUbbn - currentUbbnStaked);
  return additionalNeeded;
};

/**
 * Formats a number to a specified number of decimal places
 */
export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};

/**
 * Formats BABY tokens for display
 */
export const formatBabyTokens = (value: number): string => {
  if (value >= 1_000_000) {
    return `${formatNumber(value / 1_000_000, 2)}M`;
  }
  if (value >= 1_000) {
    return `${formatNumber(value / 1_000, 2)}K`;
  }
  return formatNumber(value, 2);
};

/**
 * Calculates the user's personalized co-staking APR based on their share of the global pool
 *
 * Formula from protocol design:
 * co_staking_apr = (user_total_score / global_total_score_sum)
 *                  × total_co_staking_reward_supply
 *                  / user_active_baby
 *
 * @param userTotalScore - User's total score from rewards tracker
 * @param globalTotalScore - Total score of all co-stakers from current_rewards
 * @param totalCoStakingRewardSupply - Annual BABY tokens allocated to co-staking, calculated dynamically using cascade formula: annual_provisions × (1 - btc_portion - fp_portion) × costaking_portion
 * @param userActiveBaby - User's active BABY stake in ubbn
 * @returns User's personalized co-staking APR as a percentage
 */
export const calculateUserCoStakingAPR = (
  userTotalScore: number,
  globalTotalScore: number,
  totalCoStakingRewardSupply: number,
  userActiveBaby: number,
): number => {
  // Edge cases
  if (userTotalScore === 0 || globalTotalScore === 0 || userActiveBaby === 0) {
    return 0;
  }

  // Calculate user's share of the co-staking pool
  const poolShare = userTotalScore / globalTotalScore;

  // Calculate user's portion of annual rewards
  const userAnnualRewards = poolShare * totalCoStakingRewardSupply;

  // Calculate APR as percentage: (annual_rewards / staked_amount) × 100
  const apr = (userAnnualRewards / userActiveBaby) * 100;

  return apr;
};
