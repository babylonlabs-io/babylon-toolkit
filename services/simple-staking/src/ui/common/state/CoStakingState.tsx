import { useEffect, useMemo, useState, type PropsWithChildren } from "react";

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
import { network } from "@/ui/common/config/network/bbn";
import {
  DelegationV2StakingState,
  type DelegationV2,
} from "@/ui/common/types/delegationsV2";
import type {
  CoStakingParams,
  CoStakingAPRData,
} from "@/ui/common/types/api/coStaking";

import { useDelegationV2State } from "./DelegationV2State";

/**
 * Helper to read pending BABY operations from localStorage
 * This avoids needing the PendingOperationsProvider context
 */
const getPendingBabyOperations = (bech32Address: string | undefined) => {
  if (!bech32Address) return [];

  try {
    const storageKey = `baby-pending-operations-${network}-${bech32Address}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return parsed.map((item: any) => ({
      validatorAddress: item.validatorAddress,
      amount: BigInt(item.amount),
      operationType: item.operationType as "stake" | "unstake",
      timestamp: item.timestamp,
    }));
  } catch {
    return [];
  }
};

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
    additionalBabyNeeded: 0,
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
  const { delegations: btcDelegations } = useDelegationV2State();
  const { bech32Address } = useCosmosWallet();
  const { data: babyDelegationsRaw = [] } = useDelegations(bech32Address);

  // Track localStorage version to force re-computation of pending operations
  const [, setStorageVersion] = useState(0);

  // Listen for localStorage changes (both from other tabs and same tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.includes("baby-pending-operations")) {
        setStorageVersion((v) => v + 1);
      }
    };

    const handleCustomStorage = () => {
      setStorageVersion((v) => v + 1);
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(
      "baby-pending-operations-updated",
      handleCustomStorage,
    );

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "baby-pending-operations-updated",
        handleCustomStorage,
      );
    };
  }, []);

  // Get pending BABY operations from localStorage - now reactive to storage changes
  const pendingBabyOps = useMemo(() => {
    const ops = getPendingBabyOperations(bech32Address);
    return ops;
  }, [bech32Address]);

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
      (sum: number, d: any) => sum + Number(d.balance?.amount || 0),
      0,
    );

    // Pending stake operations from localStorage
    const pendingStakeUbbn = pendingBabyOps
      .filter((op: any) => op.operationType === "stake")
      .reduce((sum: number, op: any) => sum + Number(op.amount), 0);

    const total = confirmedUbbn + pendingStakeUbbn;

    return total;
  }, [babyDelegationsRaw, pendingBabyOps]);

  const {
    coStakingParams,
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

  const state = useMemo(
    () => ({
      params: coStakingParams?.params || null,
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
