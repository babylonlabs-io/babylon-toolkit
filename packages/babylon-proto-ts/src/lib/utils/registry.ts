import { GeneratedType, Registry } from "@cosmjs/proto-signing";
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx";

import { REGISTRY_TYPE_URLS } from "../../constants";
import * as btcstakingtx from "../../generated/babylon/btcstaking/v1/tx";
import * as epochingtx from "../../generated/babylon/epoching/v1/tx";
import * as incentivetx from "../../generated/babylon/incentive/tx";
import { MessageFns } from "../../generated/google/protobuf/any";

// Define the structure of each proto to register
type ProtoToRegister<T> = {
  typeUrl: string;
  messageType: MessageFns<T>;
};

// List of protos to register in the registry
const protosToRegister: ProtoToRegister<any>[] = [
  // BTC Staking - Creating a BTC delegation
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
    messageType: btcstakingtx.MsgCreateBTCDelegation,
  },
  // BTC Staking - Expanding a BTC delegation
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgBtcStakeExpand,
    messageType: btcstakingtx.MsgBtcStakeExpand,
  },
  // Incentives - Withdrawing BABY rewards from BTC Staking
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBTCStaking,
    messageType: incentivetx.MsgWithdrawReward,
  },
  // Epoching - Staking / Unstaking BABY
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgStakeBABY,
    messageType: epochingtx.MsgWrappedDelegate,
  },
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgUnstakeBABY,
    messageType: epochingtx.MsgWrappedUndelegate,
  },
  // Cosmos Distribution - Withdrawing rewards from BABY Staking
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawRewardForBABYStaking,
    messageType: MsgWithdrawDelegatorReward as any,
  },
];

// Utility function to create a `GeneratedType` from `MessageFns`
// Temporary workaround until https://github.com/cosmos/cosmjs/issues/1613 is fixed
const createGeneratedType = <T>(messageType: any): GeneratedType => {
  return {
    encode: messageType.encode.bind(messageType),
    decode: messageType.decode.bind(messageType),
    fromPartial: (properties?: Partial<T>): T => {
      return messageType.fromPartial(properties ?? ({} as T));
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
