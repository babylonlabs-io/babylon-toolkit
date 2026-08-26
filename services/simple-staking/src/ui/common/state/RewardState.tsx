import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useBbnQuery } from "@/ui/common/hooks/client/rpc/queries/useBbnQuery";
import { createStateUtils } from "@/ui/common/utils/createStateUtils";

interface BTCRewardBalance {
  btcStaker: number;
  coStaker: number;
}

interface RewardsStateProps {
  loading: boolean;
  showRewardModal: boolean;
  showProcessingModal: boolean;
  processing: boolean;
  bbnAddress: string;
  rewardBalance: BTCRewardBalance;
  transactionFee: number;
  transactionHash: string;
  setTransactionHash: (hash: string) => void;
  setTransactionFee: (value: number) => void;
  openRewardModal: () => void;
  closeRewardModal: () => void;
  openProcessingModal: () => void;
  closeProcessingModal: () => void;
  setProcessing: (value: boolean) => void;
  refetchRewardBalance: () => Promise<void>;
}

const defaultState: RewardsStateProps = {
  loading: false,
  showRewardModal: false,
  showProcessingModal: false,
  processing: false,
  bbnAddress: "",
  rewardBalance: { btcStaker: 0, coStaker: 0 },
  transactionFee: 0,
  transactionHash: "",
  setTransactionHash: () => {},
  openRewardModal: () => {},
  closeRewardModal: () => {},
  openProcessingModal: () => {},
  closeProcessingModal: () => {},
  setProcessing: () => {},
  setTransactionFee: () => {},
  refetchRewardBalance: () => Promise.resolve(),
};

const { StateProvider, useState: useRewardsState } =
  createStateUtils<RewardsStateProps>(defaultState);

export function RewardsState({ children }: PropsWithChildren) {
  const [showRewardModal, setRewardModal] = useState(false);
  const [showProcessingModal, setProcessingModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transactionFee, setTransactionFee] = useState(0);
  const [transactionHash, setTransactionHash] = useState("");

  const { bech32Address: bbnAddress } = useCosmosWallet();

  const {
    rewardsQuery: {
      data: rewardBalance = { btcStaker: 0, coStaker: 0 },
      isLoading: isRewardBalanceLoading,
      refetch: refetchRewardBalance,
    },
  } = useBbnQuery();

  const openRewardModal = useCallback(() => {
    setRewardModal(true);
  }, []);

  const closeRewardModal = useCallback(() => {
    setRewardModal(false);
  }, []);

  const openProcessingModal = useCallback(() => {
    setProcessingModal(true);
  }, []);

  const closeProcessingModal = useCallback(() => {
    setProcessingModal(false);
  }, []);

  const context = useMemo(
    () => ({
      loading: isRewardBalanceLoading,
      showRewardModal,
      showProcessingModal,
      processing,
      bbnAddress,
      rewardBalance,
      transactionFee,
      transactionHash,
      setTransactionHash,
      setTransactionFee,
      setProcessing,
      openRewardModal,
      closeRewardModal,
      openProcessingModal,
      closeProcessingModal,
      refetchRewardBalance: async () => {
        await refetchRewardBalance();
      },
    }),
    [
      isRewardBalanceLoading,
      showRewardModal,
      showProcessingModal,
      openProcessingModal,
      closeProcessingModal,
      processing,
      bbnAddress,
      rewardBalance,
      transactionFee,
      transactionHash,
      openRewardModal,
      closeRewardModal,
      refetchRewardBalance,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useRewardsState };
