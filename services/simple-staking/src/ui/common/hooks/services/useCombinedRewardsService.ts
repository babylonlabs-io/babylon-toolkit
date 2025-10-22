import type { EncodeObject } from "@cosmjs/proto-signing";
import { useCallback } from "react";

import babylon from "@/infrastructure/babylon";
import { useRewardsState } from "@/ui/common/state/RewardState";
import { useRewardState as useBabyRewardState } from "@/ui/baby/state/RewardState";

import { useBbnTransaction } from "../client/rpc/mutation/useBbnTransaction";

const isNonZeroAmount = (r: { amount: bigint }) => r.amount > 0n;

export const useCombinedRewardsService = () => {
  const { bbnAddress, refetchRewardBalance } = useRewardsState();
  const { refreshRewards } = useBabyRewardState();
  const { estimateBbnGasFee, signBbnTx, sendBbnTx } = useBbnTransaction();

  const buildCombinedClaimMsgs = useCallback(
    ({
      includeBtc,
      babyRewards,
    }: {
      includeBtc: boolean;
      babyRewards?: Array<{ validatorAddress: string; amount: bigint }>;
    }): EncodeObject[] => {
      if (!bbnAddress) {
        throw new Error("Babylon Wallet is not connected");
      }

      const msgs: EncodeObject[] = [];

      if (includeBtc) {
        msgs.push(
          babylon.txs.btc.createClaimRewardMsg({ address: bbnAddress }),
        );
      }

      if (babyRewards && babyRewards.length > 0) {
        msgs.push(
          ...babyRewards.filter(isNonZeroAmount).map((r) =>
            babylon.txs.baby.createClaimRewardMsg({
              validatorAddress: r.validatorAddress,
              delegatorAddress: bbnAddress,
            }),
          ),
        );
      }

      return msgs;
    },
    [bbnAddress],
  );

  const estimateCombinedClaimGas = useCallback(
    async (params: {
      includeBtc: boolean;
      babyRewards?: Array<{ validatorAddress: string; amount: bigint }>;
    }): Promise<number> => {
      const msgs = buildCombinedClaimMsgs(params);
      if (msgs.length === 0) return 0;
      const gasFee = await estimateBbnGasFee(msgs);
      return gasFee.amount.reduce((acc, coin) => acc + Number(coin.amount), 0);
    },
    [buildCombinedClaimMsgs, estimateBbnGasFee],
  );

  const claimCombined = useCallback(
    async (params: {
      includeBtc: boolean;
      babyRewards?: Array<{ validatorAddress: string; amount: bigint }>;
    }) => {
      const msgs = buildCombinedClaimMsgs(params);
      const signedTx = await signBbnTx(msgs);
      const result = await sendBbnTx(signedTx);
      // Trigger refetches to update both BTC and BABY reward views
      if (params.includeBtc) {
        await refetchRewardBalance();
      }
      if (params.babyRewards && params.babyRewards.some(isNonZeroAmount)) {
        await refreshRewards();
      }
      return result;
    },
    [
      buildCombinedClaimMsgs,
      signBbnTx,
      sendBbnTx,
      refetchRewardBalance,
      refreshRewards,
    ],
  );

  return {
    buildCombinedClaimMsgs,
    estimateCombinedClaimGas,
    claimCombined,
  };
};
