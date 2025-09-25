/**
 * Calculates the BTC eligibility percentage for co-staking rewards
 * Formula: min(active_satoshis, active_baby/score_ratio) / active_satoshis * 100
 */
export const calculateBTCEligibilityPercentage = (
  activeSatoshis: string,
  activeBaby: string,
  scoreRatio: string,
): number => {
  const sats = parseFloat(activeSatoshis);
  const baby = parseFloat(activeBaby);
  const ratio = parseFloat(scoreRatio);

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
  const ratio = parseFloat(scoreRatio);
  const requiredUbbn = satoshisAmount * ratio;
  return requiredUbbn;
};

/**
 * Calculates additional ubbn needed for full co-staking rewards
 */
export const calculateAdditionalBabyNeeded = (
  totalSatoshisStaked: number,
  currentUbbnStaked: number,
  scoreRatio: string,
): number => {
  const requiredUbbn = calculateRequiredBabyTokens(
    totalSatoshisStaked,
    scoreRatio,
  );
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
