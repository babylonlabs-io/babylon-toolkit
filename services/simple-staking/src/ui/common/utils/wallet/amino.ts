import { btcstakingtx, incentivetx } from "@babylonlabs-io/babylon-proto-ts";
import { AminoTypes } from "@cosmjs/stargate";

import { ClientError, ERROR_CODES } from "@/ui/common/errors";

import { BBN_REGISTRY_TYPE_URLS } from "./bbnRegistry";

const msgCreateBTCDelegationConverter = {
  [BBN_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation]: {
    aminoType: BBN_REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
    toAmino: (msg: btcstakingtx.MsgCreateBTCDelegation) => {
      const pop = msg.pop;
      if (!pop) {
        throw new ClientError(
          ERROR_CODES.VALIDATION_ERROR,
          "proof of possession is undefined",
        );
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
    fromAmino: (
      json: Record<string, unknown>,
    ): btcstakingtx.MsgCreateBTCDelegation => {
      const pop = json.pop as { btc_sig_type: number; btc_sig: string };
      const fpBtcPkList = json.fp_btc_pk_list as string[];
      const inclusionProof = json.staking_tx_inclusion_proof as
        | { key: { index: number; hash: string }; proof: string }
        | undefined;
      const hasInclusionProof = inclusionProof?.key?.hash;
      return {
        stakerAddr: json.staker_addr as string,
        btcPk: new Uint8Array(Buffer.from(json.btc_pk as string, "base64")),
        pop: {
          btcSigType: pop.btc_sig_type,
          btcSig: new Uint8Array(Buffer.from(pop.btc_sig, "base64")),
        },
        fpBtcPkList: fpBtcPkList.map(
          (pk) => new Uint8Array(Buffer.from(pk, "base64")),
        ),
        stakingTime: json.staking_time as number,
        stakingValue: Number.parseInt(json.staking_value as string, 10),
        stakingTx: new Uint8Array(
          Buffer.from(json.staking_tx as string, "base64"),
        ),
        stakingTxInclusionProof:
          hasInclusionProof && inclusionProof
            ? {
                key: {
                  index: inclusionProof.key.index,
                  hash: new Uint8Array(
                    Buffer.from(inclusionProof.key.hash, "base64"),
                  ),
                },
                proof: new Uint8Array(
                  Buffer.from(inclusionProof.proof, "base64"),
                ),
              }
            : undefined,
        slashingTx: new Uint8Array(
          Buffer.from(json.slashing_tx as string, "base64"),
        ),
        delegatorSlashingSig: new Uint8Array(
          Buffer.from(json.delegator_slashing_sig as string, "base64"),
        ),
        unbondingTime: json.unbonding_time as number,
        unbondingTx: new Uint8Array(
          Buffer.from(json.unbonding_tx as string, "base64"),
        ),
        unbondingValue: Number.parseInt(json.unbonding_value as string, 10),
        unbondingSlashingTx: new Uint8Array(
          Buffer.from(json.unbonding_slashing_tx as string, "base64"),
        ),
        delegatorUnbondingSlashingSig: new Uint8Array(
          Buffer.from(
            json.delegator_unbonding_slashing_sig as string,
            "base64",
          ),
        ),
      };
    },
  },
};

const msgBtcStakeExpandConverter = {
  [BBN_REGISTRY_TYPE_URLS.MsgBtcStakeExpand]: {
    aminoType: BBN_REGISTRY_TYPE_URLS.MsgBtcStakeExpand,
    toAmino: (msg: btcstakingtx.MsgBtcStakeExpand) => {
      const pop = msg.pop;
      if (!pop) {
        throw new ClientError(
          ERROR_CODES.VALIDATION_ERROR,
          "proof of possession is undefined",
        );
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
    fromAmino: (
      json: Record<string, unknown>,
    ): btcstakingtx.MsgBtcStakeExpand => {
      const pop = json.pop as { btc_sig_type: number; btc_sig: string };
      const fpBtcPkList = json.fp_btc_pk_list as string[];
      return {
        stakerAddr: json.staker_addr as string,
        btcPk: new Uint8Array(Buffer.from(json.btc_pk as string, "base64")),
        pop: {
          btcSigType: pop.btc_sig_type,
          btcSig: new Uint8Array(Buffer.from(pop.btc_sig, "base64")),
        },
        fpBtcPkList: fpBtcPkList.map(
          (pk) => new Uint8Array(Buffer.from(pk, "base64")),
        ),
        stakingTime: json.staking_time as number,
        stakingValue: Number.parseInt(json.staking_value as string, 10),
        stakingTx: new Uint8Array(
          Buffer.from(json.staking_tx as string, "base64"),
        ),
        slashingTx: new Uint8Array(
          Buffer.from(json.slashing_tx as string, "base64"),
        ),
        delegatorSlashingSig: new Uint8Array(
          Buffer.from(json.delegator_slashing_sig as string, "base64"),
        ),
        unbondingTime: json.unbonding_time as number,
        unbondingTx: new Uint8Array(
          Buffer.from(json.unbonding_tx as string, "base64"),
        ),
        unbondingValue: Number.parseInt(json.unbonding_value as string, 10),
        unbondingSlashingTx: new Uint8Array(
          Buffer.from(json.unbonding_slashing_tx as string, "base64"),
        ),
        delegatorUnbondingSlashingSig: new Uint8Array(
          Buffer.from(
            json.delegator_unbonding_slashing_sig as string,
            "base64",
          ),
        ),
        previousStakingTxHash: json.previous_staking_tx_hash as string,
        fundingTx: new Uint8Array(
          Buffer.from(json.funding_tx as string, "base64"),
        ),
      };
    },
  },
};

const msgWithdrawRewardConverter = {
  [BBN_REGISTRY_TYPE_URLS.MsgWithdrawReward]: {
    aminoType: BBN_REGISTRY_TYPE_URLS.MsgWithdrawReward,
    toAmino: (msg: incentivetx.MsgWithdrawReward) => {
      return {
        type: msg.type,
        address: msg.address,
      };
    },
    fromAmino: (
      json: Record<string, unknown>,
    ): incentivetx.MsgWithdrawReward => {
      return {
        type: json.type as string,
        address: json.address as string,
      };
    },
  },
};

export const bbnAminoConverters = {
  ...msgCreateBTCDelegationConverter,
  ...msgBtcStakeExpandConverter,
  ...msgWithdrawRewardConverter,
};

export function createBbnAminoTypes(): AminoTypes {
  return new AminoTypes({
    ...bbnAminoConverters,
  });
}
