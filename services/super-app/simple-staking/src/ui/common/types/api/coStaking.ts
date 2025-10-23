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
 * Personalized APR response from backend /v2/apr endpoint
 * Backend calculates APR based on user's total BTC and BABY staked amounts
 */
export interface PersonalizedAPRResponse {
  data: {
    current: {
      btc_staking_apr: number;
      baby_staking_apr: number;
      co_staking_apr: number;
      total_apr: number;
    };
    additional_baby_needed_for_boost: number;
    boost: {
      btc_staking_apr: number;
      baby_staking_apr: number;
      co_staking_apr: number;
      total_apr: number;
    };
  };
}

/**
 * User-specific co-staking APR data
 * These values are personalized based on the user's staking positions
 */
export interface CoStakingAPRData {
  /** A% - User's current total APR (BTC APR + BABY APR + current co-staking bonus) */
  currentApr: number | null;
  /** B% - Maximum APR user can earn at 100% eligibility (BTC APR + BABY APR + full co-staking bonus) */
  boostApr: number | null;
  isLoading: boolean;
  error?: string;
}
