import { useCallback, useMemo } from "react";

import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";
import { ONE_MINUTE } from "@/ui/common/constants";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useLogger } from "@/ui/common/hooks/useLogger";
import type { CoStakingAPRData } from "@/ui/common/types/api/coStaking";
import { calculateAdditionalBabyNeeded } from "@/ui/common/utils/coStakingCalculations";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { useDelegationsV2 } from "../client/api/useDelegationsV2";
import { ubbnToBaby } from "../../utils/bbn";

const CO_STAKING_PARAMS_KEY = "CO_STAKING_PARAMS";
const CO_STAKING_REWARDS_TRACKER_KEY = "CO_STAKING_REWARDS_TRACKER";
const CO_STAKING_CURRENT_REWARDS_KEY = "CO_STAKING_CURRENT_REWARDS";

// TODO Placeholder APR until backend provides actual calculation
const PLACEHOLDER_APR = 12.5; // placeholder APR

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

  // Get user's delegations
  const { data: delegationsData, isLoading: isDelegationsLoading } =
    useDelegationsV2(bech32Address, {
      enabled: Boolean(isCoStakingEnabled && connected && bech32Address),
    });

  // Destructure refetch functions for stable references
  const { refetch: refetchCoStakingParams } = coStakingParamsQuery;
  const { refetch: refetchRewardsTracker } = rewardsTrackerQuery;
  const { refetch: refetchCurrentRewards } = currentRewardsQuery;

  /**
   * Calculate the total satoshis staked by the user
   */
  const totalSatoshisStaked = useMemo(() => {
    if (!delegationsData?.delegations) return 0;

    return delegationsData.delegations.reduce((sum, delegation) => {
      return sum + (delegation.stakingAmount || 0);
    }, 0);
  }, [delegationsData]);

  /**
   * Get the co-staking score ratio (BABY per BTC)
   */
  const getScoreRatio = useCallback((): number => {
    const params = coStakingParamsQuery.data?.params;
    if (!params) return 50; // Default ratio

    return parseFloat(params.score_ratio_btc_by_baby);
  }, [coStakingParamsQuery.data]);

  /**
   * Calculate additional BABY tokens needed for full co-staking rewards
   */
  const getAdditionalBabyNeeded = useCallback((): number => {
    const scoreRatio = getScoreRatio();
    const rewardsTracker = rewardsTrackerQuery.data;

    // Get current ubbn staked (from rewards tracker)
    const currentUbbn = rewardsTracker ? Number(rewardsTracker.active_baby) : 0;

    // Calculate additional ubbn needed
    const additionalUbbnNeeded = calculateAdditionalBabyNeeded(
      totalSatoshisStaked,
      currentUbbn,
      scoreRatio.toString(),
    );

    // Convert to BABY for display
    return ubbnToBaby(additionalUbbnNeeded);
  }, [getScoreRatio, rewardsTrackerQuery.data, totalSatoshisStaked]);

  /**
   * Get co-staking APR (placeholder until backend provides actual data)
   */
  const getCoStakingAPR = useCallback((): CoStakingAPRData => {
    // TODO: Replace with actual APR calculation when backend endpoint is ready
    // Formula: (total_score/total_score_sum)*(circulating_supply*co-staking_reward_ratio)/active_baby

    const currentRewards = currentRewardsQuery.data;
    const rewardsTracker = rewardsTrackerQuery.data;

    if (!currentRewards || !rewardsTracker) {
      return {
        apr: null,
        isLoading:
          currentRewardsQuery.isLoading || rewardsTrackerQuery.isLoading,
        error: "APR calculation coming soon",
      };
    }

    // For now, return placeholder APR
    return {
      apr: PLACEHOLDER_APR,
      isLoading: false,
      error: undefined,
    };
  }, [
    currentRewardsQuery.data,
    currentRewardsQuery.isLoading,
    rewardsTrackerQuery.data,
    rewardsTrackerQuery.isLoading,
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
    totalSatoshisStaked,

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
      isDelegationsLoading,

    // Error states
    error:
      coStakingParamsQuery.error ||
      rewardsTrackerQuery.error ||
      currentRewardsQuery.error,

    // Feature flag
    isCoStakingEnabled,
  };
};
