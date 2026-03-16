import { type GeneratedType, Registry } from "@cosmjs/proto-signing";
import type { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx.js";

import { REGISTRY_TYPE_URLS } from "../../constants";
import * as btcstakingtx from "../../generated/babylon/btcstaking/v1/tx";
import * as epochingtx from "../../generated/babylon/epoching/v1/tx";
import * as incentivetx from "../../generated/babylon/incentive/tx";

interface ProtoCodec {
  encode(message: unknown, writer?: BinaryWriter): BinaryWriter;
  decode(input: BinaryReader | Uint8Array, length?: number): unknown;
  fromPartial(object: unknown): unknown;
}

interface ProtoToRegister {
  typeUrl: string;
  messageType: ProtoCodec;
}

const protosToRegister: ProtoToRegister[] = [
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
    messageType: btcstakingtx.MsgCreateBTCDelegation,
  },
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgBtcStakeExpand,
    messageType: btcstakingtx.MsgBtcStakeExpand,
  },
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBTCStaking,
    messageType: incentivetx.MsgWithdrawReward,
  },
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgStakeBABY,
    messageType: epochingtx.MsgWrappedDelegate,
  },
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgUnstakeBABY,
    messageType: epochingtx.MsgWrappedUndelegate,
  },
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBABYStaking,
    messageType: MsgWithdrawDelegatorReward as unknown as ProtoCodec,
  },
];

const createGeneratedType = (messageType: ProtoCodec): GeneratedType => {
  return {
    encode: messageType.encode.bind(messageType),
    decode: messageType.decode.bind(messageType),
    fromPartial: (properties?: Record<string, unknown>): unknown => {
      return messageType.fromPartial(properties ?? {});
    },
  };
};

// Create the registry with the protos to register
export const createRegistry = (): Registry => {
  const registry = new Registry();

  protosToRegister.forEach((proto) => {
    const generatedType = createGeneratedType(proto.messageType);
    registry.register(proto.typeUrl, generatedType);
  });

  return registry;
};
