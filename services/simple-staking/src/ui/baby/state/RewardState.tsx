import { type PropsWithChildren, useCallback, useMemo, useState } from "react";

import {
  type Reward,
  useRewardService,
} from "@/ui/baby/hooks/services/useRewardService";
import { useLogger } from "@/ui/common/hooks/useLogger";
import { createStateUtils } from "@/ui/common/utils/createStateUtils";

interface RewardState {
  loading: boolean;
  rewards: Reward[];
  totalReward: bigint;
  claimAll: () => Promise<{ txHash?: string } | undefined>;
  showClaimModal: boolean;
  openClaimModal: () => void;
  closeClaimModal: () => void;
  refreshRewards: () => Promise<void>;
}

const { StateProvider, useState: useRewardState } =
  createStateUtils<RewardState>({
    loading: false,
    rewards: [],
    totalReward: 0n,
    claimAll: async () => ({ txHash: undefined }),
    showClaimModal: false,
    openClaimModal: () => {},
    closeClaimModal: () => {},
    refreshRewards: () => Promise.resolve(),
  });

function RewardState({ children }: PropsWithChildren) {
  const [processing, setProcessing] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);

  const { loading, rewards, totalReward, claimAllRewards, refetchRewards } =
    useRewardService();
  const logger = useLogger();

  const openClaimModal = useCallback(() => {
    setShowClaimModal(true);
  }, []);

  const closeClaimModal = useCallback(() => {
    setShowClaimModal(false);
  }, []);

  const refreshRewards = useCallback(async () => {
    await refetchRewards();
  }, [refetchRewards]);

  const claimAll = useCallback(async () => {
    try {
      setProcessing(true);
      const result = await claimAllRewards();
      logger.info("Baby Staking: claim rewards", {
        txHash: result?.txHash,
      });
      setShowClaimModal(false);
      return result;
    } catch (error: any) {
      logger.error(error);
      throw error; // Re-throw to be handled by the caller
    } finally {
      setProcessing(false);
    }
  }, [logger, claimAllRewards]);

  const context = useMemo(
    () => ({
      loading: loading || processing,
      rewards,
      totalReward,
      claimAll,
      showClaimModal,
      openClaimModal,
      closeClaimModal,
      refreshRewards,
    }),
    [
      loading,
      processing,
      rewards,
      totalReward,
      claimAll,
      showClaimModal,
      openClaimModal,
      closeClaimModal,
      refreshRewards,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { RewardState, useRewardState };
