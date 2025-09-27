// TODO these types to be adjusted according to the actual API response
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

export interface CoStakingAPRData {
  apr: number | null;
  isLoading: boolean;
  error?: string;
}
