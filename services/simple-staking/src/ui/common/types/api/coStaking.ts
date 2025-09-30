export interface CoStakingParams {
  costaking_portion: string;
  score_ratio_btc_by_baby: string;
  validators_portion: string;
}

export interface CoStakingParamsResponse {
  params: CoStakingParams;
}

export interface CoStakerRewardsTracker {
  start_period_cumulative_reward: number;
  active_satoshis: string;
  active_baby: string;
  total_score: string;
}

export interface CoStakingCurrentRewards {
  rewards: Array<{
    denom: string;
    amount: string;
  }>;
  period: number;
  total_score: string;
}

/**
 * APR data from backend /v2/apr endpoint
 * These values are global and not user-specific
 */
export interface CoStakingAPRResponse {
  /** Base APR for BTC staking */
  btc_staking: number;
  /** APR for BABY-only staking */
  baby_staking: number;
  /** Bonus APR for co-staking */
  co_staking: number;
  /** Maximum APR (btc_staking + baby_staking + co_staking) */
  max_apr: number;
}

/**
 * User-specific co-staking APR data
 * These values are personalized based on the user's staking positions
 */
export interface CoStakingAPRData {
  /** A% - User's current total APR (BTC APR + partial co-staking bonus) */
  currentApr: number | null;
  /** B% - Maximum APR user can earn at 100% eligibility (BTC APR + full co-staking bonus) */
  boostApr: number | null;
  /** X - Additional BABY tokens needed to reach 100% eligibility and boost APR */
  additionalBabyNeeded: number;
  /** Percentage of user's BTC stake that's eligible for co-staking rewards */
  eligibilityPercentage: number;
  isLoading: boolean;
  error?: string;
}
