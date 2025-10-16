import { useEffect, useMemo, type PropsWithChildren } from "react";

import { useEventBus } from "@/ui/common/hooks/useEventBus";
import {
  useCoStakingService,
  DEFAULT_COSTAKING_SCORE_RATIO,
} from "@/ui/common/hooks/services/useCoStakingService";
import { useDelegations } from "@/ui/baby/hooks/api/useDelegations";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { createStateUtils } from "@/ui/common/utils/createStateUtils";
import { calculateRequiredBabyTokens } from "@/ui/common/utils/coStakingCalculations";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import {
  DelegationV2StakingState,
  type DelegationV2,
} from "@/ui/common/types/delegationsV2";
import type {
  CoStakingParams,
  CoStakingAPRData,
  PersonalizedAPRResponse,
} from "@/ui/common/types/api/coStaking";
import { usePendingOperationsService } from "@/ui/baby/hooks/services/usePendingOperationsService";

import { useDelegationV2State } from "./DelegationV2State";

interface BabyDelegationBalance {
  amount: string;
  denom: string;
}

interface BabyDelegationData {
  balance: BabyDelegationBalance | undefined;
  delegation: {
    delegator_address: string;
    validator_address: string;
    shares: string;
  };
}

// Event channels that should trigger co-staking data refresh
const CO_STAKING_REFRESH_CHANNELS = [
  "delegation:stake",
  "delegation:unbond",
] as const;

export interface CoStakingEligibility {
  isEligible: boolean;
  activeSatoshis: number;
  activeBabyTokens: number;
  requiredBabyTokens: number;
  additionalBabyNeeded: number;
}

interface CoStakingStateValue {
  params: CoStakingParams | null;
  // Computed values
  eligibility: CoStakingEligibility;
  scoreRatio: number;
  aprData: CoStakingAPRData;
  rawAprData: PersonalizedAPRResponse["data"] | null;
  hasValidBoostData: boolean;
  isLoading: boolean;
  isEnabled: boolean;
  hasError: boolean;
  refetch: () => Promise<void>;
  getRequiredBabyForSatoshis: (satoshis: number) => number;
}

const defaultEligibility: CoStakingEligibility = {
  isEligible: false,
  activeSatoshis: 0,
  activeBabyTokens: 0,
  requiredBabyTokens: 0,
  additionalBabyNeeded: 0,
};

const defaultState: CoStakingStateValue = {
  params: null,
  eligibility: defaultEligibility,
  scoreRatio: DEFAULT_COSTAKING_SCORE_RATIO,
  aprData: {
    currentApr: null,
    boostApr: null,
    isLoading: false,
    error: undefined,
  },
  rawAprData: null,
  hasValidBoostData: false,
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
  const { delegations: btcDelegations } = useDelegationV2State();
  const { bech32Address } = useCosmosWallet();
  const { data: babyDelegationsRaw = [] } = useDelegations(bech32Address);

  // Get pending BABY operations from context
  const { pendingOperations: pendingBabyOps } = usePendingOperationsService();

  /**
   * Calculate total BTC staked (only broadcasted delegations)
   * Includes: PENDING, ACTIVE, INTERMEDIATE_PENDING_BTC_CONFIRMATION
   * Excludes: VERIFIED (Babylon verified but not yet broadcasted to BTC)
   * Excludes: INTERMEDIATE_PENDING_VERIFICATION (waiting for Babylon verification)
   */
  const totalBtcStakedSat = useMemo(() => {
    const activeDelegations = btcDelegations.filter(
      (d: DelegationV2) =>
        d.state === DelegationV2StakingState.PENDING ||
        d.state === DelegationV2StakingState.ACTIVE ||
        d.state ===
          DelegationV2StakingState.INTERMEDIATE_PENDING_BTC_CONFIRMATION,
    );

    const total = activeDelegations.reduce(
      (sum: number, d: DelegationV2) => sum + d.stakingAmount,
      0,
    );

    return total;
  }, [btcDelegations]);

  /**
   * Calculate total BABY staked (confirmed + pending from localStorage)
   * This matches the BTC calculation behavior for consistency
   */
  const totalBabyStakedUbbn = useMemo(() => {
    // Confirmed delegations from API
    const confirmedUbbn = babyDelegationsRaw.reduce(
      (sum: number, d: unknown) => {
        const delegation = d as BabyDelegationData;
        return sum + Number(delegation.balance?.amount || 0);
      },
      0,
    );

    // Pending stake operations from localStorage
    const pendingStakeUbbn = pendingBabyOps
      .filter((op) => op.operationType === "stake")
      .reduce((sum: number, op) => sum + Number(op.amount), 0);

    const total = confirmedUbbn + pendingStakeUbbn;

    return total;
  }, [babyDelegationsRaw, pendingBabyOps]);

  const {
    coStakingParams,
    rawAprData,
    getScoreRatio,
    getCoStakingAPR,
    getUserCoStakingStatus,
    refreshCoStakingData,
    getRequiredBabyForSatoshis,
    isLoading,
    error,
    isCoStakingEnabled,
  } = useCoStakingService(totalBtcStakedSat, totalBabyStakedUbbn);

  const scoreRatio = getScoreRatio();
  const aprData = getCoStakingAPR();

  // Calculate eligibility status
  const eligibility = useMemo((): CoStakingEligibility => {
    const status = getUserCoStakingStatus();
    const activeSatoshis = status.activeSatoshis;
    const activeBabyUbbn = status.activeBaby;
    const activeBabyTokens = ubbnToBaby(activeBabyUbbn);

    const requiredBabyUbbn = calculateRequiredBabyTokens(
      activeSatoshis,
      scoreRatio,
    );
    const requiredBabyTokens = ubbnToBaby(requiredBabyUbbn);

    const isEligible = activeBabyUbbn > 0;

    return {
      isEligible,
      activeSatoshis,
      activeBabyTokens,
      requiredBabyTokens,
      additionalBabyNeeded: status.additionalBabyNeeded,
    };
  }, [getUserCoStakingStatus, scoreRatio]);

  useEffect(() => {
    const unsubscribeFns = CO_STAKING_REFRESH_CHANNELS.map((channel) =>
      eventBus.on(channel, refreshCoStakingData),
    );

    return () =>
      void unsubscribeFns.forEach((unsubscribe) => void unsubscribe());
  }, [eventBus, refreshCoStakingData]);

  // Computed: Check if all boost data is valid and available
  const hasValidBoostData = useMemo(
    () =>
      (aprData.currentApr ?? 0) > 0 &&
      (aprData.boostApr ?? 0) > 0 &&
      (eligibility.additionalBabyNeeded ?? 0) > 0,
    [aprData.currentApr, aprData.boostApr, eligibility.additionalBabyNeeded],
  );

  const state = useMemo(
    () => ({
      params: coStakingParams?.params || null,
      eligibility,
      scoreRatio,
      aprData,
      rawAprData: rawAprData ?? null,
      hasValidBoostData,
      isLoading,
      isEnabled: isCoStakingEnabled,
      hasError: Boolean(error),
      refetch: refreshCoStakingData,
      getRequiredBabyForSatoshis,
    }),
    [
      coStakingParams,
      eligibility,
      scoreRatio,
      aprData,
      rawAprData,
      hasValidBoostData,
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
