import { useCallback, useEffect, useMemo, type PropsWithChildren } from "react";

import { useEventBus } from "@/ui/common/hooks/useEventBus";
import { useCoStakingService } from "@/ui/common/hooks/services/useCoStakingService";
import { createStateUtils } from "@/ui/common/utils/createStateUtils";
import {
  calculateBTCEligibilityPercentage,
  calculateRequiredBabyTokens,
} from "@/ui/common/utils/coStakingCalculations";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import type {
  CoStakingParams,
  CoStakerRewardsTracker,
  CoStakingCurrentRewards,
  CoStakingAPRData,
} from "@/ui/common/types/api/coStaking";

import { useDelegationV2State } from "./DelegationV2State";

// Event channels that should trigger co-staking data refresh
const CO_STAKING_REFRESH_CHANNELS = [
  "delegation:stake",
  "delegation:unbond",
] as const;

export interface CoStakingEligibility {
  isEligible: boolean;
  eligibilityPercentage: number;
  activeSatoshis: number;
  activeBabyTokens: number;
  requiredBabyTokens: number;
  additionalBabyNeeded: number;
}

interface CoStakingStateValue {
  params: CoStakingParams | null;
  rewardsTracker: CoStakerRewardsTracker | null;
  currentRewards: CoStakingCurrentRewards | null;
  // Computed values
  eligibility: CoStakingEligibility;
  scoreRatio: string;
  aprData: CoStakingAPRData;
  isLoading: boolean;
  isEnabled: boolean;
  hasError: boolean;
  refetch: () => Promise<void>;
  getRequiredBabyForSatoshis: (satoshis: number) => number;
}

const defaultEligibility: CoStakingEligibility = {
  isEligible: false,
  eligibilityPercentage: 0,
  activeSatoshis: 0,
  activeBabyTokens: 0,
  requiredBabyTokens: 0,
  additionalBabyNeeded: 0,
};

const defaultState: CoStakingStateValue = {
  params: null,
  rewardsTracker: null,
  currentRewards: null,
  eligibility: defaultEligibility,
  scoreRatio: "50", // Default ratio
  aprData: {
    currentApr: null,
    boostApr: null,
    additionalBabyNeeded: 0,
    eligibilityPercentage: 0,
    isLoading: false,
    error: undefined,
  },
  isLoading: false,
  isEnabled: false,
  hasError: false,
  refetch: async () => {},
  getRequiredBabyForSatoshis: () => 0,
};

const { StateProvider, useState: useCoStakingState } =
  createStateUtils<CoStakingStateValue>(defaultState);

export function CoStakingState({ children }: PropsWithChildren) {
  const eventBus = useEventBus();
  const { delegations } = useDelegationV2State();

  const {
    coStakingParams,
    rewardsTracker,
    currentRewards,
    getScoreRatio,
    getCoStakingAPR,
    getUserCoStakingStatus,
    refreshCoStakingData,
    isLoading,
    error,
    isCoStakingEnabled,
  } = useCoStakingService();

  const scoreRatio = getScoreRatio();
  const aprData = getCoStakingAPR();

  // Calculate eligibility status
  const eligibility = useMemo((): CoStakingEligibility => {
    const status = getUserCoStakingStatus();
    const activeSatoshis = Number(status.activeSatoshis);
    const activeBabyUbbn = Number(status.activeBaby);
    const activeBabyTokens = ubbnToBaby(activeBabyUbbn);

    const eligibilityPercentage = calculateBTCEligibilityPercentage(
      status.activeSatoshis,
      status.activeBaby,
      scoreRatio.toString(),
    );

    const requiredBabyUbbn = calculateRequiredBabyTokens(
      activeSatoshis,
      scoreRatio.toString(),
    );
    const requiredBabyTokens = ubbnToBaby(requiredBabyUbbn);

    const isEligible = eligibilityPercentage > 0;

    return {
      isEligible,
      eligibilityPercentage,
      activeSatoshis,
      activeBabyTokens,
      requiredBabyTokens,
      additionalBabyNeeded: status.additionalBabyNeeded,
    };
  }, [getUserCoStakingStatus, scoreRatio]);

  const getRequiredBabyForSatoshis = useCallback(
    (satoshis: number): number => {
      const requiredUbbn = calculateRequiredBabyTokens(
        satoshis,
        scoreRatio.toString(),
      );
      return ubbnToBaby(requiredUbbn);
    },
    [scoreRatio],
  );

  useEffect(() => {
    const unsubscribeFns = CO_STAKING_REFRESH_CHANNELS.map((channel) =>
      eventBus.on(channel, refreshCoStakingData),
    );

    return () =>
      void unsubscribeFns.forEach((unsubscribe) => void unsubscribe());
  }, [eventBus, refreshCoStakingData]);

  useEffect(() => {
    if (isCoStakingEnabled && delegations.length > 0) {
      refreshCoStakingData();
    }
  }, [delegations.length, isCoStakingEnabled, refreshCoStakingData]);

  const state = useMemo(
    () => ({
      params: coStakingParams?.params || null,
      rewardsTracker: rewardsTracker || null,
      currentRewards: currentRewards || null,
      eligibility,
      scoreRatio,
      aprData,
      isLoading,
      isEnabled: isCoStakingEnabled,
      hasError: Boolean(error),
      refetch: refreshCoStakingData,
      getRequiredBabyForSatoshis,
    }),
    [
      coStakingParams,
      rewardsTracker,
      currentRewards,
      eligibility,
      scoreRatio,
      aprData,
      isLoading,
      isCoStakingEnabled,
      error,
      refreshCoStakingData,
      getRequiredBabyForSatoshis,
    ],
  );

  return <StateProvider value={state}>{children}</StateProvider>;
}

export { useCoStakingState };
