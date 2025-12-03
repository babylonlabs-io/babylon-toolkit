import { BTC_STAKER, REGISTRY_TYPE_URLS } from "../../constants";
import * as incentivetx from "../../generated/babylon/incentive/tx";

/**
 * Creates a withdraw reward message for withdrawing rewards for BTC staking.
 * @param address - The address to withdraw rewards from
 * @returns The withdraw reward message
 */
export interface ClaimRewardParams {
  address: string;
}

const createClaimRewardMsg = ({ address }: ClaimRewardParams) => {
  const withdrawRewardMsg = incentivetx.MsgWithdrawReward.fromPartial({
    type: BTC_STAKER,
    address,
  });

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBTCStaking,
    value: withdrawRewardMsg,
  };
};

export default {
  createClaimRewardMsg,
};
