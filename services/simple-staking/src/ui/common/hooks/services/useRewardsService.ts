import { useCallback } from "react";

import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useLogger } from "@/ui/common/hooks/useLogger";
import { useRewardsState } from "@/ui/common/state/RewardState";
import babylon from "@/infrastructure/babylon";

import { useBbnTransaction } from "../client/rpc/mutation/useBbnTransaction";

export const useRewardsService = () => {
  const {
    bbnAddress,
    openRewardModal,
    closeRewardModal,
    openProcessingModal,
    closeProcessingModal,
    setTransactionHash,
    setProcessing,
    setTransactionFee,
  } = useRewardsState();
  const { handleError } = useError();
  const logger = useLogger();
  const { estimateBbnGasFee, sendBbnTx, signBbnTx } = useBbnTransaction();

  /**
   * Estimates the gas fee for claiming rewards.
   * @returns {Promise<number>} The gas fee for claiming rewards.
   */
  const estimateClaimRewardsGas = useCallback(async (): Promise<number> => {
    const msg = babylon.txs.btc.createClaimRewardMsg({ address: bbnAddress });
    const gasFee = await estimateBbnGasFee(msg);
    return gasFee.amount.reduce((acc, coin) => acc + Number(coin.amount), 0);
  }, [bbnAddress, estimateBbnGasFee]);

  const showPreview = useCallback(async () => {
    setTransactionFee(0);
    setProcessing(true);
    openRewardModal();
    try {
      const fee = await estimateClaimRewardsGas();
      setTransactionFee(fee);
    } catch (error: any) {
      logger.error(error, {
        tags: { bbnAddress },
      });
      handleError({ error });
    } finally {
      setProcessing(false);
    }
  }, [
    estimateClaimRewardsGas,
    setProcessing,
    openRewardModal,
    setTransactionFee,
    logger,
    handleError,
    bbnAddress,
  ]);

  /**
   * Claims the rewards from the user's account.
   */
  const claimRewards = useCallback(async () => {
    closeRewardModal();
    setProcessing(true);
    openProcessingModal();

    try {
      const msg = babylon.txs.btc.createClaimRewardMsg({ address: bbnAddress });
      const signedTx = await signBbnTx(msg);
      const result = await sendBbnTx(signedTx);

      if (result?.txHash) {
        setTransactionHash(result.txHash);
      }

      return result;
    } catch (error: any) {
      closeProcessingModal();
      setTransactionHash("");
      logger.error(error, {
        tags: { bbnAddress },
      });
      throw error; // Re-throw to be handled by the caller
    } finally {
      setProcessing(false);
    }
  }, [
    closeRewardModal,
    setProcessing,
    openProcessingModal,
    bbnAddress,
    signBbnTx,
    sendBbnTx,
    setTransactionHash,
    closeProcessingModal,
    logger,
  ]);

  return {
    claimRewards,
    showPreview,
  };
};
