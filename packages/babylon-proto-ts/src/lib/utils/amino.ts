import { AminoTypes } from "@cosmjs/stargate";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";

import { REGISTRY_TYPE_URLS } from "../../constants";
import * as btcstakingtx from "../../generated/babylon/btcstaking/v1/tx";
import * as epochingtx from "../../generated/babylon/epoching/v1/tx";
import * as incentivetx from "../../generated/babylon/incentive/tx";

// BTC Staking
const msgCreateBTCDelegationConverter = {
  [REGISTRY_TYPE_URLS.MsgCreateBTCDelegation]: {
    aminoType: REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
    toAmino: (msg: btcstakingtx.MsgCreateBTCDelegation) => {
      const pop = msg.pop;
      if (!pop) {
        throw new Error("Proof of possession is undefined");
      }
      return {
        staker_addr: msg.stakerAddr,
        btc_pk: Buffer.from(msg.btcPk).toString("base64"),
        pop: {
          btc_sig_type: pop.btcSigType,
          btc_sig: Buffer.from(pop.btcSig).toString("base64"),
        },
        fp_btc_pk_list: msg.fpBtcPkList.map((pk) =>
          Buffer.from(pk).toString("base64"),
        ),
        staking_time: msg.stakingTime,
        staking_value: msg.stakingValue.toString(),
        staking_tx: Buffer.from(msg.stakingTx).toString("base64"),
        slashing_tx: Buffer.from(msg.slashingTx).toString("base64"),
        delegator_slashing_sig: Buffer.from(msg.delegatorSlashingSig).toString(
          "base64",
        ),
        unbonding_time: msg.unbondingTime,
        unbonding_tx: Buffer.from(msg.unbondingTx).toString("base64"),
        unbonding_value: msg.unbondingValue.toString(),
        unbonding_slashing_tx: Buffer.from(msg.unbondingSlashingTx).toString(
          "base64",
        ),
        delegator_unbonding_slashing_sig: Buffer.from(
          msg.delegatorUnbondingSlashingSig,
        ).toString("base64"),
        ...(msg.stakingTxInclusionProof?.key
          ? {
              staking_tx_inclusion_proof: {
                key: {
                  index: msg.stakingTxInclusionProof.key.index,
                  hash: Buffer.from(
                    msg.stakingTxInclusionProof.key.hash,
                  ).toString("base64"),
                },
                proof: Buffer.from(msg.stakingTxInclusionProof.proof).toString(
                  "base64",
                ),
              },
            }
          : {}),
      };
    },
    fromAmino: (json: any): btcstakingtx.MsgCreateBTCDelegation => {
      const hasInclusionProof = json.staking_tx_inclusion_proof?.key.hash;
      return {
        stakerAddr: json.staker_addr,
        btcPk: Buffer.from(json.btc_pk, "base64"),
        pop: {
          btcSigType: json.pop.btc_sig_type,
          btcSig: Buffer.from(json.pop.btc_sig, "base64"),
        },
        fpBtcPkList: json.fp_btc_pk_list.map((pk: string) =>
          Buffer.from(pk, "base64"),
        ),
        stakingTime: json.staking_time,
        stakingValue: parseInt(json.staking_value, 10),
        stakingTx: Buffer.from(json.staking_tx, "base64"),
        stakingTxInclusionProof: hasInclusionProof
          ? {
              key: {
                index: json.staking_tx_inclusion_proof.key.index,
                hash: Buffer.from(
                  json.staking_tx_inclusion_proof.key.hash,
                  "base64",
                ),
              },
              proof: Buffer.from(
                json.staking_tx_inclusion_proof.proof,
                "base64",
              ),
            }
          : undefined,
        slashingTx: Buffer.from(json.slashing_tx, "base64"),
        delegatorSlashingSig: Buffer.from(
          json.delegator_slashing_sig,
          "base64",
        ),
        unbondingTime: json.unbonding_time,
        unbondingTx: Buffer.from(json.unbonding_tx, "base64"),
        unbondingValue: parseInt(json.unbonding_value, 10),
        unbondingSlashingTx: Buffer.from(json.unbonding_slashing_tx, "base64"),
        delegatorUnbondingSlashingSig: Buffer.from(
          json.delegator_unbonding_slashing_sig,
          "base64",
        ),
      };
    },
  },
};

// BTC Staking - Expand existing BTC delegation
const msgBtcStakeExpandConverter = {
  [REGISTRY_TYPE_URLS.MsgBtcStakeExpand]: {
    aminoType: REGISTRY_TYPE_URLS.MsgBtcStakeExpand,
    toAmino: (msg: btcstakingtx.MsgBtcStakeExpand) => {
      const pop = msg.pop;
      if (!pop) {
        throw new Error("Proof of possession is undefined");
      }
      return {
        staker_addr: msg.stakerAddr,
        btc_pk: Buffer.from(msg.btcPk).toString("base64"),
        pop: {
          btc_sig_type: pop.btcSigType,
          btc_sig: Buffer.from(pop.btcSig).toString("base64"),
        },
        fp_btc_pk_list: msg.fpBtcPkList.map((pk) =>
          Buffer.from(pk).toString("base64"),
        ),
        staking_time: msg.stakingTime,
        staking_value: msg.stakingValue.toString(),
        staking_tx: Buffer.from(msg.stakingTx).toString("base64"),
        slashing_tx: Buffer.from(msg.slashingTx).toString("base64"),
        delegator_slashing_sig: Buffer.from(msg.delegatorSlashingSig).toString(
          "base64",
        ),
        unbonding_time: msg.unbondingTime,
        unbonding_tx: Buffer.from(msg.unbondingTx).toString("base64"),
        unbonding_value: msg.unbondingValue.toString(),
        unbonding_slashing_tx: Buffer.from(msg.unbondingSlashingTx).toString(
          "base64",
        ),
        delegator_unbonding_slashing_sig: Buffer.from(
          msg.delegatorUnbondingSlashingSig,
        ).toString("base64"),
        previous_staking_tx_hash: msg.previousStakingTxHash,
        funding_tx: Buffer.from(msg.fundingTx).toString("base64"),
      };
    },
    fromAmino: (json: any): btcstakingtx.MsgBtcStakeExpand => {
      return {
        stakerAddr: json.staker_addr,
        btcPk: Buffer.from(json.btc_pk, "base64"),
        pop: {
          btcSigType: json.pop.btc_sig_type,
          btcSig: Buffer.from(json.pop.btc_sig, "base64"),
        },
        fpBtcPkList: json.fp_btc_pk_list.map((pk: string) =>
          Buffer.from(pk, "base64"),
        ),
        stakingTime: json.staking_time,
        stakingValue: parseInt(json.staking_value, 10),
        stakingTx: Buffer.from(json.staking_tx, "base64"),
        slashingTx: Buffer.from(json.slashing_tx, "base64"),
        delegatorSlashingSig: Buffer.from(
          json.delegator_slashing_sig,
          "base64",
        ),
        unbondingTime: json.unbonding_time,
        unbondingTx: Buffer.from(json.unbonding_tx, "base64"),
        unbondingValue: parseInt(json.unbonding_value, 10),
        unbondingSlashingTx: Buffer.from(json.unbonding_slashing_tx, "base64"),
        delegatorUnbondingSlashingSig: Buffer.from(
          json.delegator_unbonding_slashing_sig,
          "base64",
        ),
        previousStakingTxHash: json.previous_staking_tx_hash,
        fundingTx: Buffer.from(json.funding_tx, "base64"),
      };
    },
  },
};

// Incentives - Withdrawing BABY rewards from BTC Staking
const msgWithdrawRewardForBTCStakingConverter = {
  [REGISTRY_TYPE_URLS.MsgWithdrawRewardForBTCStaking]: {
    aminoType: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBTCStaking,
    toAmino: (msg: incentivetx.MsgWithdrawReward) => {
      return {
        type: msg.type,
        address: msg.address,
      };
    },
    fromAmino: (json: any): incentivetx.MsgWithdrawReward => {
      return {
        type: json.type,
        address: json.address,
      };
    },
  },
};

// Epoching - Staking BABY
const msgStakeBABYConverter = {
  [REGISTRY_TYPE_URLS.MsgStakeBABY]: {
    aminoType: REGISTRY_TYPE_URLS.MsgStakeBABY,
    toAmino: (msg: epochingtx.MsgWrappedDelegate) => {
      return {
        msg: {
          delegator_address: msg.msg?.delegatorAddress,
          validator_address: msg.msg?.validatorAddress,
          amount: msg.msg?.amount,
        },
      };
    },
    fromAmino: (json: any): epochingtx.MsgWrappedDelegate => {
      return {
        msg: {
          delegatorAddress: json.msg.delegator_address,
          validatorAddress: json.msg.validator_address,
          amount: json.msg.amount,
        },
      };
    },
  },
};

// Epoching - Unstaking BABY
const msgUnstakeBABYConverter = {
  [REGISTRY_TYPE_URLS.MsgUnstakeBABY]: {
    aminoType: REGISTRY_TYPE_URLS.MsgUnstakeBABY,
    toAmino: (msg: epochingtx.MsgWrappedUndelegate) => {
      return {
        msg: {
          delegator_address: msg.msg?.delegatorAddress,
          validator_address: msg.msg?.validatorAddress,
          amount: msg.msg?.amount,
        },
      };
    },
    fromAmino: (json: any): epochingtx.MsgWrappedUndelegate => {
      return {
        msg: {
          delegatorAddress: json.msg.delegator_address,
          validatorAddress: json.msg.validator_address,
          amount: json.msg.amount,
        },
      };
    },
  },
};

// Cosmos Distribution - Withdrawing BABY rewards from BABY Staking
const msgWithdrawRewardForBABYStakingConverter = {
  [REGISTRY_TYPE_URLS.MsgWithdrawRewardForBABYStaking]: {
    aminoType: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBABYStaking,
    toAmino: (msg: MsgWithdrawDelegatorReward) => {
      return {
        delegator_address: msg.delegatorAddress,
        validator_address: msg.validatorAddress,
      };
    },
    fromAmino: (json: any): MsgWithdrawDelegatorReward => {
      return {
        delegatorAddress: json.delegator_address,
        validatorAddress: json.validator_address,
      };
    },
  },
};

export const aminoConverters = {
  ...msgCreateBTCDelegationConverter,
  ...msgBtcStakeExpandConverter,
  ...msgWithdrawRewardForBTCStakingConverter,
  ...msgStakeBABYConverter,
  ...msgUnstakeBABYConverter,
  ...msgWithdrawRewardForBABYStakingConverter,
};

export const createAminoTypes = (): AminoTypes => {
  return new AminoTypes({
    ...aminoConverters,
  });
};
