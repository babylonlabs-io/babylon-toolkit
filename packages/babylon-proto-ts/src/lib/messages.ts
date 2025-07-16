import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";

import { BTC_STAKER, REGISTRY_TYPE_URLS } from "../constants";
import * as epochingtx from "../generated/babylon/epoching/v1/tx";
import * as incentivetx from "../generated/babylon/incentive/tx";

/**
 * Creates a withdraw reward message for withdrawing rewards for BTC staking.
 * @param address - The address to withdraw rewards from
 * @returns The withdraw reward message
 */
export const createWithdrawRewardForBTCStakingMsg = (address: string) => {
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
 * Creates a staking message for BABY staking.
 * @param delegatorAddress - The delegator address
 * @param validatorAddress - The validator address
 * @param amount - The amount to stake
 * @returns The staking message
 */
export const createStakeBABYMsg = (
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
export const createUnstakeBABYMsg = (
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
export const createWithdrawRewardForBABYStakingMsg = (
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
  createWithdrawRewardForBTCStakingMsg,
  createStakeBABYMsg,
  createUnstakeBABYMsg,
  createWithdrawRewardForBABYStakingMsg,
};
