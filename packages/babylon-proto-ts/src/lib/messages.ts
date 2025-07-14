import * as incentivetx from "../generated/babylon/incentive/tx";
import { BTC_STAKER } from "../constants";
import { REGISTRY_TYPE_URLS } from "../constants";

export default {
  createWithdrawRewardMsg(address: string) {
    const withdrawRewardMsg = incentivetx.MsgWithdrawReward.fromPartial({
      type: BTC_STAKER,
      address,
    });

    return {
      typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawReward,
      value: withdrawRewardMsg,
    };
  },
};
