import { BTC_STAKER, REGISTRY_TYPE_URLS } from "../constants";
import * as incentivetx from "../generated/babylon/incentive/tx";

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
