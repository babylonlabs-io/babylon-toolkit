import { BTC_STAKER, REGISTRY_TYPE_URLS } from "../../constants";
import * as btcstakingtx from "../../generated/babylon/btcstaking/v1/tx";
import * as incentivetx from "../../generated/babylon/incentive/tx";

/**
 * Creates a withdraw reward message for withdrawing rewards for BTC staking.
 * @param address - The address to withdraw rewards from
 * @returns The withdraw reward message
 */
const createWithdrawRewardMsg = (address: string) => {
  const withdrawRewardMsg = incentivetx.MsgWithdrawReward.fromPartial({
    type: BTC_STAKER,
    address,
  });

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBTCStaking,
    value: withdrawRewardMsg,
  };
};

/**
 * Creates a BTC stake expansion message
 * @param params - The parameters for the stake expansion
 * @returns The BTC stake expansion message
 */
const createExpandMsg = (
  params: Partial<btcstakingtx.MsgBtcStakeExpand>,
) => {
  const stakeExpandMsg = btcstakingtx.MsgBtcStakeExpand.fromPartial(params);

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgBtcStakeExpand,
    value: stakeExpandMsg,
  };
};

export default {
  createWithdrawRewardMsg,
  createExpandMsg,
};
