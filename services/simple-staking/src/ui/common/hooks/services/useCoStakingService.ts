import { useCallback } from "react";

import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";
import { ONE_MINUTE } from "@/ui/common/constants";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useLogger } from "@/ui/common/hooks/useLogger";
import type { CoStakingAPRData } from "@/ui/common/types/api/coStaking";
import {
  calculateAdditionalBabyNeeded,
  calculateBTCEligibilityPercentage,
  calculateUserCoStakingAPR,
} from "@/ui/common/utils/coStakingCalculations";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { getAPR } from "@/ui/common/api/getAPR";

const CO_STAKING_PARAMS_KEY = "CO_STAKING_PARAMS";
const CO_STAKING_REWARDS_TRACKER_KEY = "CO_STAKING_REWARDS_TRACKER";
const CO_STAKING_CURRENT_REWARDS_KEY = "CO_STAKING_CURRENT_REWARDS";
const CO_STAKING_APR_KEY = "CO_STAKING_APR";
const CO_STAKING_REWARD_SUPPLY_KEY = "CO_STAKING_REWARD_SUPPLY";

export const DEFAULT_COSTAKING_SCORE_RATIO = 50;

/**
 * Hook for managing co-staking functionality
 * Provides methods to fetch co-staking data, calculate requirements, and manage rewards
 */
export const useCoStakingService = () => {
  const { bech32Address, connected } = useCosmosWallet();
  const { handleError } = useError();
  const logger = useLogger();

  // Check if co-staking is enabled
  const isCoStakingEnabled = FeatureFlagService.IsCoStakingEnabled;

  // Query for co-staking parameters
  const coStakingParamsQuery = useClientQuery({
    queryKey: [CO_STAKING_PARAMS_KEY],
    queryFn: async () => {
      const client = await babylon.client();
      try {
        const params = await client.baby.getCostakingParams();
        // Convert to match the existing interface
        return {
          params: {
            costaking_portion: params.costakingPortion.toString(),
            score_ratio_btc_by_baby: params.scoreRatioBtcByBaby,
            validators_portion: params.validatorsPortion.toString(),
          },
        };
      } catch (error) {
        logger.error(error as Error, {
          tags: { action: "getCostakingParams" },
        });
        return null;
      }
    },
    enabled: isCoStakingEnabled,
    staleTime: ONE_MINUTE * 5, // Cache for 5 minutes
    retry: 3,
  });

  // Query for user's co-staking rewards tracker
  const rewardsTrackerQuery = useClientQuery({
    queryKey: [CO_STAKING_REWARDS_TRACKER_KEY, bech32Address],
    queryFn: async () => {
      if (!bech32Address) return null;

      const client = await babylon.client();
      try {
        const tracker =
          await client.baby.getCoStakerRewardsTracker(bech32Address);
        if (!tracker) return null;

        // Convert to match the existing interface
        return {
          start_period_cumulative_reward: tracker.startPeriodCumulativeReward,
          active_satoshis: tracker.activeSatoshis,
          active_baby: tracker.activeBaby,
          total_score: tracker.totalScore,
        };
      } catch (error) {
        logger.error(error as Error, {
          tags: { action: "getCoStakerRewardsTracker", bech32Address },
        });
        return null;
      }
    },
    enabled: Boolean(isCoStakingEnabled && connected && bech32Address),
    staleTime: ONE_MINUTE,
    retry: 3,
  });

  // Query for current co-staking rewards
  const currentRewardsQuery = useClientQuery({
    queryKey: [CO_STAKING_CURRENT_REWARDS_KEY],
    queryFn: async () => {
      const client = await babylon.client();
      try {
        const rewards = await client.baby.getCurrentCoStakingRewards();
        // Convert to match the existing interface
        return {
          rewards: rewards.rewards,
          period: rewards.period,
          total_score: rewards.totalScore,
        };
      } catch (error) {
        logger.error(error as Error, {
          tags: { action: "getCurrentCoStakingRewards" },
        });
        throw error;
      }
    },
    enabled: isCoStakingEnabled,
    staleTime: ONE_MINUTE,
    retry: 3,
  });

  // Query for APR data
  const aprQuery = useClientQuery({
    queryKey: [CO_STAKING_APR_KEY],
    queryFn: async () => {
      try {
        return await getAPR();
      } catch (error) {
        logger.error(error as Error, {
          tags: { action: "getAPR" },
        });
        return null;
      }
    },
    enabled: isCoStakingEnabled,
    staleTime: Infinity, // Fetch once per page load
    retry: 3,
  });

  // Query for total co-staking reward supply
  const rewardSupplyQuery = useClientQuery({
    queryKey: [CO_STAKING_REWARD_SUPPLY_KEY],
    queryFn: async () => {
      const client = await babylon.client();
      try {
        return await client.baby.getAnnualCoStakingRewardSupply();
      } catch (error) {
        logger.error(error as Error, {
          tags: { action: "getAnnualCoStakingRewardSupply" },
        });
        return null;
      }
    },
    enabled: isCoStakingEnabled,
    staleTime: ONE_MINUTE * 5, // Cache for 5 minutes
    retry: 3,
  });

  // Destructure refetch functions for stable references
  const { refetch: refetchCoStakingParams } = coStakingParamsQuery;
  const { refetch: refetchRewardsTracker } = rewardsTrackerQuery;
  const { refetch: refetchCurrentRewards } = currentRewardsQuery;

  /**
   * Get the co-staking score ratio (BABY per BTC)
   */
  const getScoreRatio = useCallback((): number => {
    const scoreRatio = Number(
      coStakingParamsQuery.data?.params?.score_ratio_btc_by_baby,
    );

    if (!scoreRatio || scoreRatio <= 0) return DEFAULT_COSTAKING_SCORE_RATIO;

    return scoreRatio;
  }, [coStakingParamsQuery.data]);

  /**
   * Calculate additional BABY tokens needed for full co-staking rewards
   */
  const getAdditionalBabyNeeded = useCallback((): number => {
    const scoreRatio = getScoreRatio();
    const rewardsTracker = rewardsTrackerQuery.data;

    if (!rewardsTracker) return 0;

    const activeSatoshis = Number(rewardsTracker.active_satoshis);
    const currentUbbn = Number(rewardsTracker.active_baby);

    // Calculate additional ubbn needed
    const additionalUbbnNeeded = calculateAdditionalBabyNeeded(
      activeSatoshis,
      currentUbbn,
      scoreRatio,
    );

    // Convert to BABY for display
    return ubbnToBaby(additionalUbbnNeeded);
  }, [getScoreRatio, rewardsTrackerQuery.data]);

  /**
   * Get co-staking APR with current and boost values
   *
   * Uses the formula based on user's share of the global co-staking pool:
   *
   * co_staking_apr = (user_total_score / global_total_score_sum)
   *                  × total_co_staking_reward_supply
   *                  / user_active_baby
   *
   * A% (Current APR) = BTC staking APR + BABY staking APR + user's co-staking APR
   * B% (Boost APR) = What user earns at 100% co-staking eligibility
   * X (Additional BABY needed) = BABY tokens to reach 100% eligibility
   *
   * Example UI Message: "Your current APR is A%. Stake X BABY to boost it up to B%."
   */
  const getCoStakingAPR = useCallback((): CoStakingAPRData => {
    const rewardsTracker = rewardsTrackerQuery.data;
    const currentRewards = currentRewardsQuery.data;
    const aprData = aprQuery.data;
    const rewardSupply = rewardSupplyQuery.data;
    const scoreRatio = getScoreRatio();
    const additionalBabyNeeded = getAdditionalBabyNeeded();

    // Check if we have all required data
    const isLoading =
      rewardsTrackerQuery.isLoading ||
      currentRewardsQuery.isLoading ||
      aprQuery.isLoading ||
      rewardSupplyQuery.isLoading ||
      coStakingParamsQuery.isLoading;

    if (!aprData || !rewardsTracker || !currentRewards || !rewardSupply) {
      return {
        currentApr: null,
        boostApr: null,
        additionalBabyNeeded: 0,
        eligibilityPercentage: 0,
        isLoading,
        error: isLoading ? undefined : "APR data not available",
      };
    }

    // Prepare numeric values once
    const activeSatoshis = Number(rewardsTracker.active_satoshis);
    const activeBabyUbbn = Number(rewardsTracker.active_baby);
    const userScore = Number(rewardsTracker.total_score);
    const globalScore = Number(currentRewards.total_score);

    // Calculate eligibility percentage (what % of BTC qualifies for co-staking bonus)
    const eligibilityPercentage = calculateBTCEligibilityPercentage(
      activeSatoshis,
      activeBabyUbbn,
      scoreRatio,
    );

    // Calculate user's personalized co-staking APR based on pool share
    const userCoStakingApr = calculateUserCoStakingAPR(
      userScore,
      globalScore,
      rewardSupply,
      activeBabyUbbn,
    );

    // Current APR = BTC staking APR + user's co-staking APR
    const currentApr = aprData.btc_staking + userCoStakingApr;

    // Calculate boost APR: what user earns at 100% eligibility
    // Need to calculate what user_total_score would be with full eligibility
    const requiredBaby = activeSatoshis * scoreRatio;
    const maxTotalScore = activeSatoshis;

    // Calculate co-staking APR at 100% eligibility
    const boostCoStakingApr = calculateUserCoStakingAPR(
      maxTotalScore,
      globalScore,
      rewardSupply,
      requiredBaby,
    );

    const boostApr = aprData.btc_staking + boostCoStakingApr;

    return {
      currentApr,
      boostApr,
      additionalBabyNeeded,
      eligibilityPercentage,
      isLoading: false,
      error: undefined,
    };
  }, [
    rewardsTrackerQuery.data,
    rewardsTrackerQuery.isLoading,
    currentRewardsQuery.data,
    currentRewardsQuery.isLoading,
    aprQuery.data,
    aprQuery.isLoading,
    rewardSupplyQuery.data,
    rewardSupplyQuery.isLoading,
    coStakingParamsQuery.isLoading,
    getScoreRatio,
    getAdditionalBabyNeeded,
  ]);

  /**
   * Get user's co-staking status
   */
  const getUserCoStakingStatus = useCallback(() => {
    const rewardsTracker = rewardsTrackerQuery.data;
    const additionalBabyNeeded = getAdditionalBabyNeeded();

    const activeSatoshis = rewardsTracker
      ? Number(rewardsTracker.active_satoshis)
      : 0;
    const activeBaby = rewardsTracker ? Number(rewardsTracker.active_baby) : 0;
    const totalScore = rewardsTracker ? Number(rewardsTracker.total_score) : 0;

    return {
      isCoStaking: activeBaby > 0,
      activeSatoshis,
      activeBaby,
      totalScore,
      additionalBabyNeeded,
    };
  }, [rewardsTrackerQuery.data, getAdditionalBabyNeeded]);

  /**
   * Refresh all co-staking data
   */
  const refreshCoStakingData = useCallback(async () => {
    try {
      await Promise.all([
        refetchCoStakingParams(),
        refetchRewardsTracker(),
        refetchCurrentRewards(),
      ]);
    } catch (error) {
      logger.error(error as Error, {
        tags: { bech32Address },
      });
      handleError({ error: error as Error });
    }
  }, [
    refetchCoStakingParams,
    refetchRewardsTracker,
    refetchCurrentRewards,
    logger,
    bech32Address,
    handleError,
  ]);

  return {
    // Data
    coStakingParams: coStakingParamsQuery.data,
    rewardsTracker: rewardsTrackerQuery.data,
    currentRewards: currentRewardsQuery.data,
    aprData: aprQuery.data,
    rewardSupply: rewardSupplyQuery.data,

    // Methods
    getScoreRatio,
    getAdditionalBabyNeeded,
    getCoStakingAPR,
    getUserCoStakingStatus,
    refreshCoStakingData,

    // Loading states
    isLoading:
      coStakingParamsQuery.isLoading ||
      rewardsTrackerQuery.isLoading ||
      currentRewardsQuery.isLoading ||
      aprQuery.isLoading ||
      rewardSupplyQuery.isLoading,

    // Error states
    error:
      coStakingParamsQuery.error ||
      rewardsTrackerQuery.error ||
      currentRewardsQuery.error ||
      aprQuery.error ||
      rewardSupplyQuery.error,

    // Feature flag
    isCoStakingEnabled,
  };
};
