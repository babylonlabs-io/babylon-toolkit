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
  calculateCurrentAPR,
} from "@/ui/common/utils/coStakingCalculations";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { ubbnToBaby } from "../../utils/bbn";
import { getAPR } from "../../api/getAPR";

const CO_STAKING_PARAMS_KEY = "CO_STAKING_PARAMS";
const CO_STAKING_REWARDS_TRACKER_KEY = "CO_STAKING_REWARDS_TRACKER";
const CO_STAKING_CURRENT_REWARDS_KEY = "CO_STAKING_CURRENT_REWARDS";
const CO_STAKING_APR_KEY = "CO_STAKING_APR";

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

  // Destructure refetch functions for stable references
  const { refetch: refetchCoStakingParams } = coStakingParamsQuery;
  const { refetch: refetchRewardsTracker } = rewardsTrackerQuery;
  const { refetch: refetchCurrentRewards } = currentRewardsQuery;

  /**
   * Get the co-staking score ratio (BABY per BTC)
   */
  const getScoreRatio = useCallback((): string => {
    const params = coStakingParamsQuery.data?.params;
    if (!params) return "50"; // Default ratio

    return params.score_ratio_btc_by_baby;
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
   * Co-staking rewards are ADDITIVE bonuses on top of BTC staking rewards.
   *
   * A% (Current APR) = What the user earns now:
   *   - Full BTC staking APR (15.5%)
   *   - PLUS partial co-staking bonus based on eligibility (12.7%, for example)
   *   - Formula: btc_staking_apr + (co_staking_apr × eligibility%)
   *   - Example: 15.5% + (12.7% × 33.33%) = 19.73%
   *
   * B% (Boost APR) = Maximum APR with 100% co-staking eligibility:
   *   - Full BTC staking APR (15.5%)
   *   - PLUS full co-staking bonus (12.7%, for example)
   *   - Formula: btc_staking_apr + co_staking_apr
   *   - Example: 15.5% + 12.7% = 28.2%
   *
   * X (Additional BABY needed) = BABY tokens to reach 100% eligibility
   *   - Already calculated by getAdditionalBabyNeeded()
   *
   * UI Message: "Your current APR is A%. Stake X BABY to boost it up to B%."
   * Real Example: "Your current APR is 19.73%. Stake 4 BABY to boost it up to 28.2%."
   */
  const getCoStakingAPR = useCallback((): CoStakingAPRData => {
    const rewardsTracker = rewardsTrackerQuery.data;
    const aprData = aprQuery.data;
    const scoreRatio = getScoreRatio();
    const additionalBabyNeeded = getAdditionalBabyNeeded();

    // Check if we have all required data
    const isLoading =
      rewardsTrackerQuery.isLoading ||
      aprQuery.isLoading ||
      coStakingParamsQuery.isLoading;

    if (!aprData || !rewardsTracker) {
      return {
        currentApr: null,
        boostApr: null,
        additionalBabyNeeded: 0,
        eligibilityPercentage: 0,
        isLoading,
        error: isLoading ? undefined : "APR data not available",
      };
    }

    // Calculate eligibility percentage (what % of BTC qualifies for co-staking bonus)
    const eligibilityPercentage = calculateBTCEligibilityPercentage(
      rewardsTracker.active_satoshis,
      rewardsTracker.active_baby,
      scoreRatio,
    );

    // Calculate current APR (A%) = BTC APR + (co-staking bonus × eligibility)
    // User earns full BTC APR + partial co-staking bonus based on BABY staked
    const currentApr = calculateCurrentAPR(
      rewardsTracker.active_satoshis,
      rewardsTracker.active_baby,
      scoreRatio,
      aprData.btc_staking,
      aprData.co_staking,
    );

    // Boost APR (B%) = BTC APR + full co-staking APR
    // This is what user earns at 100% eligibility (when they stake enough BABY)
    const boostApr = aprData.btc_staking + aprData.co_staking;

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
    aprQuery.data,
    aprQuery.isLoading,
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

    return {
      isCoStaking: Boolean(
        rewardsTracker && rewardsTracker.active_baby !== "0",
      ),
      activeSatoshis: rewardsTracker?.active_satoshis || "0",
      activeBaby: rewardsTracker?.active_baby || "0",
      totalScore: rewardsTracker?.total_score || "0",
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
      aprQuery.isLoading,

    // Error states
    error:
      coStakingParamsQuery.error ||
      rewardsTrackerQuery.error ||
      currentRewardsQuery.error ||
      aprQuery.error,

    // Feature flag
    isCoStakingEnabled,
  };
};
