import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";

import { REGISTRY_TYPE_URLS } from "../../constants";
import * as epochingtx from "../../generated/babylon/epoching/v1/tx";

/**
 * Creates a staking message for BABY staking.
 * @param delegatorAddress - The delegator address
 * @param validatorAddress - The validator address
 * @param amount - The amount to stake in ubbn
 * @returns The staking message
 */
export interface StakeParams {
  delegatorAddress: string;
  validatorAddress: string;
  amount: bigint;
}

const createStakeMsg = ({ delegatorAddress, validatorAddress, amount }: StakeParams) => {
  const wrappedDelegateMsg = epochingtx.MsgWrappedDelegate.fromPartial({
    msg: {
      delegatorAddress,
      validatorAddress,
      amount: {
        denom: 'ubbn',
        amount: amount.toString()
      }
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
 * @param amount - The amount to unstake in ubbn
 * @returns The unstaking message
 */
export interface UnstakeParams {
  delegatorAddress: string;
  validatorAddress: string;
  amount: bigint;
}

const createUnstakeMsg = ({ delegatorAddress, validatorAddress, amount }: UnstakeParams) => {
  const wrappedUndelegateMsg = epochingtx.MsgWrappedUndelegate.fromPartial({ 
    msg: {
      delegatorAddress,
      validatorAddress,
      amount: {
        denom: 'ubbn',
        amount: amount.toString()
      }
    }
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
export interface ClaimRewardParams {
  delegatorAddress: string;
  validatorAddress: string;
}

const createClaimRewardMsg = (params: ClaimRewardParams) => {
  const withdrawRewardMsg = MsgWithdrawDelegatorReward.fromPartial(params);

  return {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBABYStaking,
    value: withdrawRewardMsg,
  };
};

export default {
  createStakeMsg,
  createUnstakeMsg,
  createClaimRewardMsg,
};
