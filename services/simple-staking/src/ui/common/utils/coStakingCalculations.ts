import { ubbnToBaby } from "./bbn";
import { btcToSatoshi } from "./btc";

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
 * Calculates the required BABY tokens for full BTC co-staking rewards
 * Based on the formula: BTC_amount * 5000 BABY
 */
export const calculateRequiredBabyTokens = (
  btcAmount: number,
  scoreRatio: string,
): number => {
  // Score ratio is in uBBN per sat
  // We need to convert to BABY per BTC
  const ratio = parseFloat(scoreRatio);
  const sats = btcToSatoshi(btcAmount);
  const requiredUbbn = sats * ratio;
  return ubbnToBaby(requiredUbbn);
};

/**
 * Calculates additional BABY tokens needed for full co-staking rewards
 */
export const calculateAdditionalBabyNeeded = (
  totalBtcStaked: number,
  currentBabyStaked: number,
  scoreRatio: string,
): number => {
  const requiredBaby = calculateRequiredBabyTokens(totalBtcStaked, scoreRatio);
  const additionalNeeded = Math.max(0, requiredBaby - currentBabyStaked);
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
