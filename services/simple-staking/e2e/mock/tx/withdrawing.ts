import { initBTCCurve, Staking } from "@babylonlabs-io/btc-staking-ts";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { networks, payments } from "bitcoinjs-lib";

import { DelegationState } from "@/ui/common/types/delegations";

import { mockNetworkInfo } from "../../mocks/handlers/constants";
import { activeTX } from "./unbonding";

initBTCCurve();
export const withdrawalPrivateKeyHex = "4".padStart(64, "0");
const publicKey = Buffer.from(
  ecc.pointFromScalar(Buffer.from(withdrawalPrivateKeyHex, "hex"), true)!,
);
export const withdrawalDestination = payments.p2wpkh({ pubkey: publicKey });
const params = mockNetworkInfo.data.params.bbn[0];
const original = activeTX.data[0];
const staking = new Staking(
  networks.bitcoin,
  {
    address: withdrawalDestination.address!,
    publicKeyNoCoordHex: publicKey.subarray(1).toString("hex"),
  },
  {
    covenantNoCoordPks: params.covenant_pks.map((pk) => pk.slice(2)),
    covenantQuorum: params.covenant_quorum,
    unbondingTime: params.unbonding_time_blocks,
    unbondingFeeSat: params.unbonding_fee_sat,
    minStakingAmountSat: params.min_staking_value_sat,
    maxStakingAmountSat: params.max_staking_value_sat,
    minStakingTimeBlocks: params.min_staking_time_blocks,
    maxStakingTimeBlocks: params.max_staking_time_blocks,
  },
  [original.finality_provider_pk_hex],
  original.staking_tx.timelock,
);
const fundingOutpoint = { txid: "11".repeat(32), vout: 0 };
const feeRate = 1; // Satoshis per virtual byte.
const { transaction: stakingTx } = staking.createStakingTransaction(
  params.min_staking_value_sat,
  [
    {
      ...fundingOutpoint,
      value: params.max_staking_value_sat,
      scriptPubKey: withdrawalDestination.output!.toString("hex"),
    },
  ],
  feeRate,
);
export const { transaction: unbondingTransaction } =
  staking.createUnbondingTransaction(stakingTx);
export const { fee: withdrawalFee } =
  staking.createWithdrawEarlyUnbondedTransaction(unbondingTransaction, feeRate);

export const unbondedTX = {
  data: [
    {
      ...original,
      staking_tx_hash_hex: stakingTx.getId(),
      staker_pk_hex: publicKey.subarray(1).toString("hex"),
      staking_value: params.min_staking_value_sat,
      state: DelegationState.UNBONDED,
      staking_tx: { ...original.staking_tx, tx_hex: stakingTx.toHex() },
      unbonding_tx: {
        tx_hex: unbondingTransaction.toHex(),
        output_index: 0,
        start_timestamp: original.staking_tx.start_timestamp,
        start_height: original.staking_tx.start_height,
        timelock: params.unbonding_time_blocks,
      },
    },
  ],
  pagination: { next_key: "" },
};
