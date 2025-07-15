import { GeneratedType, Registry } from "@cosmjs/proto-signing";

import { REGISTRY_TYPE_URLS } from "../../constants";
import * as btcstakingtx from "../../generated/babylon/btcstaking/v1/tx";
import * as incentivetx from "../../generated/babylon/incentive/tx";
import { MessageFns } from "../../generated/google/protobuf/any";

// Define the structure of each proto to register
type ProtoToRegister<T> = {
  typeUrl: string;
  messageType: MessageFns<T>;
};

// List of protos to register in the registry
const protosToRegister: ProtoToRegister<any>[] = [
  // BTC Staking
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgCreateBTCDelegation,
    messageType: btcstakingtx.MsgCreateBTCDelegation,
  },
  // Incentives
  {
    typeUrl: REGISTRY_TYPE_URLS.MsgWithdrawReward,
    messageType: incentivetx.MsgWithdrawReward,
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
