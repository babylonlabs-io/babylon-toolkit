import { useCallback, useMemo } from "react";

import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";
import { ONE_MINUTE } from "@/ui/common/constants";
import { useLogger } from "@/ui/common/hooks/useLogger";
import type { CoStakingAPRData } from "@/ui/common/types/api/coStaking";
import {
  calculateAdditionalBabyNeeded,
  calculateRequiredBabyTokens,
} from "@/ui/common/utils/coStakingCalculations";
import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { getPersonalizedAPR } from "@/ui/common/api/getAPR";

const CO_STAKING_PARAMS_KEY = "CO_STAKING_PARAMS";
const CO_STAKING_APR_KEY = "CO_STAKING_APR";

export const DEFAULT_COSTAKING_SCORE_RATIO = 50;

/**
 * Hook for managing co-staking functionality
 * Provides methods to fetch co-staking data, calculate requirements, and manage rewards
 *
 * @param totalBtcStakedSat - Total BTC staked in satoshis (confirmed + pending from localStorage)
 * @param totalBabyStakedUbbn - Total BABY staked in ubbn (confirmed + pending from localStorage)
 */
export const useCoStakingService = (
  totalBtcStakedSat: number,
  totalBabyStakedUbbn: number,
) => {
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
            score_ratio_btc_by_baby: String(params.scoreRatioBtcByBaby),
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

  // Query for personalized APR data from backend
  const aprQuery = useClientQuery({
    queryKey: [CO_STAKING_APR_KEY, totalBtcStakedSat, totalBabyStakedUbbn],
    queryFn: async () => {
      try {
        const result = await getPersonalizedAPR(
          totalBtcStakedSat,
          totalBabyStakedUbbn,
        );

        return result;
      } catch (error) {
        logger.error(error as Error, {
          tags: {
            action: "getPersonalizedAPR",
            btcStaked: String(totalBtcStakedSat),
            babyStaked: String(totalBabyStakedUbbn),
          },
        });
        return null;
      }
    },
    enabled: isCoStakingEnabled,
    staleTime: ONE_MINUTE, // Cache for 1 minute
    retry: 3,
  });

  // Destructure refetch functions for stable references
  const { refetch: refetchCoStakingParams } = coStakingParamsQuery;
  const { refetch: refetchAPR } = aprQuery;

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
   * Uses backend-provided value or falls back to frontend calculation
   */
  const getAdditionalBabyNeeded = useCallback((): number => {
    const aprData = aprQuery.data;

    // Use backend-provided value if available
    if (aprData && aprData.additional_baby_needed_for_boost !== undefined) {
      return aprData.additional_baby_needed_for_boost;
    }

    // Fallback to frontend calculation if backend data not available
    const scoreRatio = getScoreRatio();
    const additionalUbbnNeeded = calculateAdditionalBabyNeeded(
      totalBtcStakedSat,
      totalBabyStakedUbbn,
      scoreRatio,
    );

    return ubbnToBaby(additionalUbbnNeeded);
  }, [aprQuery.data, getScoreRatio, totalBtcStakedSat, totalBabyStakedUbbn]);

  /**
   * Get co-staking APR with current and boost values
   *
   * Returns personalized APR data from backend:
   * - A% (Current APR) = current.total_apr (BTC + BABY + current co-staking)
   * - B% (Boost APR) = boost.total_apr (BTC + BABY + maximum co-staking)
   * - X (Additional BABY needed) = additional_baby_needed_for_boost
   */
  const getCoStakingAPR = useCallback((): CoStakingAPRData => {
    const aprData = aprQuery.data;

    // Check if we have all required data
    const isLoading = aprQuery.isLoading || coStakingParamsQuery.isLoading;

    if (!aprData) {
      return {
        currentApr: null,
        boostApr: null,
        additionalBabyNeeded: 0,
        isLoading,
        error: isLoading ? undefined : "APR data not available",
      };
    }

    return {
      currentApr: aprData.current.total_apr,
      boostApr: aprData.boost.total_apr,
      additionalBabyNeeded: aprData.additional_baby_needed_for_boost,
      isLoading: false,
      error: undefined,
    };
  }, [aprQuery.data, aprQuery.isLoading, coStakingParamsQuery.isLoading]);

  /**
   * Get user's co-staking status based on provided stake amounts
   */
  const getUserCoStakingStatus = useCallback(() => {
    const additionalBabyNeeded = getAdditionalBabyNeeded();

    return {
      isCoStaking: totalBabyStakedUbbn > 0,
      activeSatoshis: totalBtcStakedSat,
      activeBaby: totalBabyStakedUbbn,
      totalScore: 0, // No longer needed with backend API
      additionalBabyNeeded,
    };
  }, [totalBtcStakedSat, totalBabyStakedUbbn, getAdditionalBabyNeeded]);

  /**
   * Refresh all co-staking data
   */
  const refreshCoStakingData = useCallback(async () => {
    try {
      await Promise.all([refetchCoStakingParams(), refetchAPR()]);
    } catch (error) {
      logger.error(error as Error, {
        tags: { action: "refreshCoStakingData" },
      });
    }
  }, [refetchCoStakingParams, refetchAPR, logger]);

  /**
   * Calculate required BABY tokens for a given amount of BTC satoshis
   */
  const getRequiredBabyForSatoshis = useCallback(
    (satoshis: number): number => {
      const scoreRatio = getScoreRatio();
      const requiredUbbn = calculateRequiredBabyTokens(satoshis, scoreRatio);
      return ubbnToBaby(requiredUbbn);
    },
    [getScoreRatio],
  );

  const isLoading = useMemo(
    () => coStakingParamsQuery.isLoading || aprQuery.isLoading,
    [coStakingParamsQuery.isLoading, aprQuery.isLoading],
  );

  const error = useMemo(
    () => coStakingParamsQuery.error || aprQuery.error,
    [coStakingParamsQuery.error, aprQuery.error],
  );

  return {
    // Data
    coStakingParams: coStakingParamsQuery.data,
    rawAprData: aprQuery.data,

    // Methods
    getScoreRatio,
    getAdditionalBabyNeeded,
    getCoStakingAPR,
    getUserCoStakingStatus,
    refreshCoStakingData,
    getRequiredBabyForSatoshis,

    // Loading states
    isLoading,

    // Error states
    error,

    // Feature flag
    isCoStakingEnabled,
  };
};
