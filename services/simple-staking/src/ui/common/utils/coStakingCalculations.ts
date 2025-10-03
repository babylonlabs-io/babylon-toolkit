/**
 * Calculates the BTC eligibility percentage for co-staking rewards
 * Formula: min(active_satoshis, active_baby/score_ratio) / active_satoshis * 100
 *
 * @param activeSatoshis
 * @param activeBaby
 * @param scoreRatio
 */
export const calculateBTCEligibilityPercentage = (
  activeSatoshis: string,
  activeBaby: string,
  scoreRatio: string,
): number => {
  const sats = Number(activeSatoshis);
  const baby = Number(activeBaby);
  const ratio = Number(scoreRatio);

  if (sats === 0) return 0;
  if (ratio === 0) return 0;

  const eligibleSats = Math.min(sats, baby / ratio);
  return (eligibleSats / sats) * 100;
};

/**
 * Calculates the required ubbn for full BTC co-staking rewards
 * Based on satoshis * scoreRatio formula
 */
export const calculateRequiredBabyTokens = (
  satoshisAmount: number,
  scoreRatio: string,
): number => {
  // Score ratio is in uBBN per sat
  const ratio = Number(scoreRatio);
  const requiredUbbn = satoshisAmount * ratio;
  return requiredUbbn;
};

/**
 * Calculates additional ubbn needed for full co-staking rewards
 */
export const calculateAdditionalBabyNeeded = (
  activeSatoshis: number,
  currentUbbnStaked: number,
  scoreRatio: string,
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
  userTotalScore: string,
  globalTotalScore: string,
  totalCoStakingRewardSupply: number,
  userActiveBaby: string,
): number => {
  const userScore = Number(userTotalScore);
  const globalScore = Number(globalTotalScore);
  const activeBaby = Number(userActiveBaby);

  // Edge cases
  if (userScore === 0 || globalScore === 0 || activeBaby === 0) {
    return 0;
  }

  // Calculate user's share of the co-staking pool
  const poolShare = userScore / globalScore;

  // Calculate user's portion of annual rewards
  const userAnnualRewards = poolShare * totalCoStakingRewardSupply;

  // Calculate APR as percentage: (annual_rewards / staked_amount) × 100
  const apr = (userAnnualRewards / activeBaby) * 100;

  return apr;
};
