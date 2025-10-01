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
 * Calculates the user's current total APR based on their co-staking participation
 *
 * Co-staking APR is ADDITIVE - it's a bonus on top of BTC staking APR.
 * Users earn:
 * 1. Full BTC staking APR on their BTC stake
 * 2. PLUS additional co-staking APR on the eligible portion of their BTC
 *
 * Formula: currentApr = btcStakingApr + (coStakingApr × eligibility%)
 *
 * @param activeSatoshis - Total satoshis staked
 * @param activeBaby - Total ubbn staked
 * @param scoreRatio - Score ratio
 * @param btcStakingApr - Base BTC staking APR (earned on all BTC)
 * @param coStakingApr - Co-staking bonus APR (earned on eligible BTC only)
 * @returns User's current total APR (BTC APR + partial co-staking bonus)
 */
export const calculateCurrentAPR = (
  activeSatoshis: string,
  activeBaby: string,
  scoreRatio: string,
  btcStakingApr: number,
  coStakingApr: number,
): number => {
  const sats = Number(activeSatoshis);
  const ratio = Number(scoreRatio);

  if (sats === 0) return 0;
  if (ratio === 0) return btcStakingApr;

  // Calculate eligibility percentage (what % of BTC qualifies for co-staking bonus)
  const eligibilityPercentage =
    calculateBTCEligibilityPercentage(activeSatoshis, activeBaby, scoreRatio) /
    100;

  // Current APR = Base BTC APR + (Co-staking bonus APR × eligibility)
  const currentApr = btcStakingApr + coStakingApr * eligibilityPercentage;

  return currentApr;
};
