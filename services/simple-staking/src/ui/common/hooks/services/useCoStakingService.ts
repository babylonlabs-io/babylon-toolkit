import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { getCurrentCoStakingRewards } from "@/ui/common/api/coStaking/getCurrentCoStakingRewards";
import { getCoStakerRewardsTracker } from "@/ui/common/api/coStaking/getCoStakerRewardsTracker";
import { getCoStakingParams } from "@/ui/common/api/coStaking/getCoStakingParams";
import { ONE_MINUTE } from "@/ui/common/constants";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useLogger } from "@/ui/common/hooks/useLogger";
import type {
  CoStakingAPRData,
  CoStakingRequirements,
} from "@/ui/common/types/api/coStaking";
import {
  calculateAdditionalBabyNeeded,
  calculateBTCEligibilityPercentage,
  calculateRequiredBabyTokens,
} from "@/ui/common/utils/coStakingCalculations";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import { useDelegationsV2 } from "../client/api/useDelegationsV2";
import { satoshiToBtc } from "../../utils/btc";
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
  const coStakingParamsQuery = useQuery({
    queryKey: [CO_STAKING_PARAMS_KEY],
    queryFn: getCoStakingParams,
    enabled: isCoStakingEnabled,
    staleTime: ONE_MINUTE * 5, // Cache for 5 minutes
    retry: 3,
  });

  // Query for user's co-staking rewards tracker
  const rewardsTrackerQuery = useQuery({
    queryKey: [CO_STAKING_REWARDS_TRACKER_KEY, bech32Address],
    queryFn: () => getCoStakerRewardsTracker(bech32Address || ""),
    enabled: Boolean(isCoStakingEnabled && connected && bech32Address),
    staleTime: ONE_MINUTE,
    retry: 3,
  });

  // Query for current co-staking rewards
  const currentRewardsQuery = useQuery({
    queryKey: [CO_STAKING_CURRENT_REWARDS_KEY],
    queryFn: getCurrentCoStakingRewards,
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
   * Calculate the total BTC staked by the user
   */
  const totalBtcStaked = useMemo(() => {
    if (!delegationsData?.delegations) return 0;

    const totalSats = delegationsData.delegations.reduce((sum, delegation) => {
      return sum + (delegation.stakingAmount || 0);
    }, 0);

    return satoshiToBtc(totalSats);
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
   * Calculate required BABY tokens for full co-staking rewards
   */
  const getRequiredBabyAmount = useCallback((): CoStakingRequirements => {
    const scoreRatio = getScoreRatio();
    const rewardsTracker = rewardsTrackerQuery.data;

    // Calculate required BABY for full rewards
    const requiredBaby = calculateRequiredBabyTokens(
      totalBtcStaked,
      scoreRatio.toString(),
    );

    // Get current BABY staked (from rewards tracker)
    const currentBaby = rewardsTracker
      ? ubbnToBaby(Number(rewardsTracker.active_baby))
      : 0;

    // Calculate additional BABY needed
    const additionalNeeded = calculateAdditionalBabyNeeded(
      totalBtcStaked,
      currentBaby,
      scoreRatio.toString(),
    );

    // Calculate BTC eligibility percentage
    const eligibilityPercentage = rewardsTracker
      ? calculateBTCEligibilityPercentage(
          rewardsTracker.active_satoshis,
          rewardsTracker.active_baby,
          scoreRatio.toString(),
        )
      : 0;

    return {
      requiredBabyTokens: requiredBaby,
      currentBabyTokens: currentBaby,
      additionalBabyNeeded: additionalNeeded,
      btcEligibilityPercentage: eligibilityPercentage,
      scoreRatio,
    };
  }, [getScoreRatio, rewardsTrackerQuery.data, totalBtcStaked]);

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
    const requirements = getRequiredBabyAmount();

    return {
      isCoStaking: Boolean(
        rewardsTracker && rewardsTracker.active_baby !== "0",
      ),
      activeSatoshis: rewardsTracker?.active_satoshis || "0",
      activeBaby: rewardsTracker?.active_baby || "0",
      totalScore: rewardsTracker?.total_score || "0",
      ...requirements,
    };
  }, [rewardsTrackerQuery.data, getRequiredBabyAmount]);

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
    totalBtcStaked,

    // Methods
    getScoreRatio,
    getRequiredBabyAmount,
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
