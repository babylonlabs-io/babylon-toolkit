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
