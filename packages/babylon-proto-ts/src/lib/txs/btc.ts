import { BTC_STAKER, REGISTRY_TYPE_URLS } from "../../constants";
import * as btcstakingtx from "../../generated/babylon/btcstaking/v1/tx";
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

//TODO: modify input params to accept tx hashes instead of raw bin format (Uint8Array -> string)
/**
 * Creates a BTC stake expansion message
 * @param params - The parameters for the stake expansion
 * @returns The BTC stake expansion message
 */
const createExpandMsg = (params: Partial<btcstakingtx.MsgBtcStakeExpand>) => {
  const stakeExpandMsg = btcstakingtx.MsgBtcStakeExpand.fromPartial(params);

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgBtcStakeExpand,
    value: stakeExpandMsg,
  };
};

export default {
  createClaimRewardMsg,
  createExpandMsg,
};
