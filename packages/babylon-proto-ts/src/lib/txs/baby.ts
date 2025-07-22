import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";

import { REGISTRY_TYPE_URLS } from "../../constants";
import * as epochingtx from "../../generated/babylon/epoching/v1/tx";

/**
 * Creates a staking message for BABY staking.
 * @param delegatorAddress - The delegator address
 * @param validatorAddress - The validator address
 * @param amount - The amount to stake
 * @returns The staking message
 */
export const createStakeMsg = (
  delegatorAddress: string,
  validatorAddress: string,
  amount: Coin,
) => {
  const wrappedDelegateMsg = epochingtx.MsgWrappedDelegate.fromPartial({
    msg: {
      delegatorAddress,
      validatorAddress,
      amount,
    },
  });

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgStakeBABY,
    value: wrappedDelegateMsg,
  };
};

/**
 * Creates an unstaking message for BABY staking.
 * @param delegatorAddress - The delegator address
 * @param validatorAddress - The validator address
 * @param amount - The amount to unstake
 * @returns The unstaking message
 */
export const createUnstakeMsg = (
  delegatorAddress: string,
  validatorAddress: string,
  amount: Coin,
) => {
  const wrappedUndelegateMsg = epochingtx.MsgWrappedUndelegate.fromPartial({
    msg: {
      delegatorAddress,
      validatorAddress,
      amount,
    },
  });

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgUnstakeBABY,
    value: wrappedUndelegateMsg,
  };
};

/**
 * Creates a withdraw rewards message for BABY staking.
 * @param delegatorAddress - The delegator address
 * @param validatorAddress - The validator address
 * @returns The withdraw delegator reward message
 */
export const createWithdrawRewardMsg = (
  delegatorAddress: string,
  validatorAddress: string,
) => {
  const withdrawRewardMsg = MsgWithdrawDelegatorReward.fromPartial({
    delegatorAddress,
    validatorAddress,
  });

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBABYStaking,
    value: withdrawRewardMsg,
  };
};

export default {
  createStakeMsg,
  createUnstakeMsg,
  createWithdrawRewardMsg,
};
