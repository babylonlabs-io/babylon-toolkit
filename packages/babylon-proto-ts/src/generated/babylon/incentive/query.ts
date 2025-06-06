// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// versions:
//   protoc-gen-ts_proto  v2.6.1
//   protoc               unknown
// source: babylon/incentive/query.proto

/* eslint-disable */
import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { Coin } from "../../cosmos/base/v1beta1/coin";
import { Params } from "./params";

export const protobufPackage = "babylon.incentive";

/** QueryParamsRequest is request type for the Query/Params RPC method. */
export interface QueryParamsRequest {
}

/** QueryParamsResponse is response type for the Query/Params RPC method. */
export interface QueryParamsResponse {
  /** params holds all the parameters of this module. */
  params: Params | undefined;
}

/**
 * QueryRewardGaugesRequest is request type for the Query/RewardGauges RPC
 * method.
 */
export interface QueryRewardGaugesRequest {
  /** address is the address of the stakeholder in bech32 string */
  address: string;
}

/**
 * RewardGaugesResponse is an object that stores rewards distributed to a BTC
 * staking stakeholder
 */
export interface RewardGaugesResponse {
  /**
   * coins are coins that have been in the gauge
   * Can have multiple coin denoms
   */
  coins: Coin[];
  /**
   * withdrawn_coins are coins that have been withdrawn by the stakeholder
   * already
   */
  withdrawnCoins: Coin[];
}

/**
 * QueryRewardGaugesResponse is response type for the Query/RewardGauges RPC
 * method.
 */
export interface QueryRewardGaugesResponse {
  /**
   * reward_gauges is the map of reward gauges, where key is the stakeholder
   * type and value is the reward gauge holding all rewards for the stakeholder
   * in that type
   */
  rewardGauges: { [key: string]: RewardGaugesResponse };
}

export interface QueryRewardGaugesResponse_RewardGaugesEntry {
  key: string;
  value: RewardGaugesResponse | undefined;
}

/**
 * QueryBTCStakingGaugeRequest is request type for the Query/BTCStakingGauge RPC
 * method.
 */
export interface QueryBTCStakingGaugeRequest {
  /** height is the queried Babylon height */
  height: number;
}

/**
 * BTCStakingGaugeResponse is response type for the Query/BTCStakingGauge RPC
 * method.
 */
export interface BTCStakingGaugeResponse {
  /**
   * coins that have been in the gauge
   * can have multiple coin denoms
   */
  coins: Coin[];
}

/**
 * QueryBTCStakingGaugeResponse is response type for the Query/BTCStakingGauge
 * RPC method.
 */
export interface QueryBTCStakingGaugeResponse {
  /** gauge is the BTC staking gauge at the queried height */
  gauge: BTCStakingGaugeResponse | undefined;
}

/**
 * QueryDelegatorWithdrawAddressRequest is the request type for the
 * Query/DelegatorWithdrawAddress RPC method.
 */
export interface QueryDelegatorWithdrawAddressRequest {
  /** delegator_address defines the delegator address to query for. */
  delegatorAddress: string;
}

/**
 * QueryDelegatorWithdrawAddressResponse is the response type for the
 * Query/DelegatorWithdrawAddress RPC method.
 */
export interface QueryDelegatorWithdrawAddressResponse {
  /** withdraw_address defines the delegator address to query for. */
  withdrawAddress: string;
}

/**
 * QueryDelegationRewardsRequest is the request type for the
 * Query/DelegationRewards RPC method.
 */
export interface QueryDelegationRewardsRequest {
  /**
   * finality_provider_address defines the finality provider address of the
   * delegation.
   */
  finalityProviderAddress: string;
  /** delegator_address defines the delegator address to query for. */
  delegatorAddress: string;
}

/**
 * QueryDelegationRewardsResponse is the response type for the
 * Query/DelegationRewards RPC method.
 */
export interface QueryDelegationRewardsResponse {
  /**
   * rewards are the delegation reward coins
   * Can have multiple coin denoms
   */
  rewards: Coin[];
}

function createBaseQueryParamsRequest(): QueryParamsRequest {
  return {};
}

export const QueryParamsRequest: MessageFns<QueryParamsRequest> = {
  encode(_: QueryParamsRequest, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryParamsRequest {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryParamsRequest();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(_: any): QueryParamsRequest {
    return {};
  },

  toJSON(_: QueryParamsRequest): unknown {
    const obj: any = {};
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryParamsRequest>, I>>(base?: I): QueryParamsRequest {
    return QueryParamsRequest.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryParamsRequest>, I>>(_: I): QueryParamsRequest {
    const message = createBaseQueryParamsRequest();
    return message;
  },
};

function createBaseQueryParamsResponse(): QueryParamsResponse {
  return { params: undefined };
}

export const QueryParamsResponse: MessageFns<QueryParamsResponse> = {
  encode(message: QueryParamsResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.params !== undefined) {
      Params.encode(message.params, writer.uint32(10).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryParamsResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryParamsResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.params = Params.decode(reader, reader.uint32());
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryParamsResponse {
    return { params: isSet(object.params) ? Params.fromJSON(object.params) : undefined };
  },

  toJSON(message: QueryParamsResponse): unknown {
    const obj: any = {};
    if (message.params !== undefined) {
      obj.params = Params.toJSON(message.params);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryParamsResponse>, I>>(base?: I): QueryParamsResponse {
    return QueryParamsResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryParamsResponse>, I>>(object: I): QueryParamsResponse {
    const message = createBaseQueryParamsResponse();
    message.params = (object.params !== undefined && object.params !== null)
      ? Params.fromPartial(object.params)
      : undefined;
    return message;
  },
};

function createBaseQueryRewardGaugesRequest(): QueryRewardGaugesRequest {
  return { address: "" };
}

export const QueryRewardGaugesRequest: MessageFns<QueryRewardGaugesRequest> = {
  encode(message: QueryRewardGaugesRequest, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.address !== "") {
      writer.uint32(10).string(message.address);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryRewardGaugesRequest {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryRewardGaugesRequest();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.address = reader.string();
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryRewardGaugesRequest {
    return { address: isSet(object.address) ? globalThis.String(object.address) : "" };
  },

  toJSON(message: QueryRewardGaugesRequest): unknown {
    const obj: any = {};
    if (message.address !== "") {
      obj.address = message.address;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryRewardGaugesRequest>, I>>(base?: I): QueryRewardGaugesRequest {
    return QueryRewardGaugesRequest.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryRewardGaugesRequest>, I>>(object: I): QueryRewardGaugesRequest {
    const message = createBaseQueryRewardGaugesRequest();
    message.address = object.address ?? "";
    return message;
  },
};

function createBaseRewardGaugesResponse(): RewardGaugesResponse {
  return { coins: [], withdrawnCoins: [] };
}

export const RewardGaugesResponse: MessageFns<RewardGaugesResponse> = {
  encode(message: RewardGaugesResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    for (const v of message.coins) {
      Coin.encode(v!, writer.uint32(10).fork()).join();
    }
    for (const v of message.withdrawnCoins) {
      Coin.encode(v!, writer.uint32(18).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): RewardGaugesResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRewardGaugesResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.coins.push(Coin.decode(reader, reader.uint32()));
          continue;
        }
        case 2: {
          if (tag !== 18) {
            break;
          }

          message.withdrawnCoins.push(Coin.decode(reader, reader.uint32()));
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RewardGaugesResponse {
    return {
      coins: globalThis.Array.isArray(object?.coins) ? object.coins.map((e: any) => Coin.fromJSON(e)) : [],
      withdrawnCoins: globalThis.Array.isArray(object?.withdrawnCoins)
        ? object.withdrawnCoins.map((e: any) => Coin.fromJSON(e))
        : [],
    };
  },

  toJSON(message: RewardGaugesResponse): unknown {
    const obj: any = {};
    if (message.coins?.length) {
      obj.coins = message.coins.map((e) => Coin.toJSON(e));
    }
    if (message.withdrawnCoins?.length) {
      obj.withdrawnCoins = message.withdrawnCoins.map((e) => Coin.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RewardGaugesResponse>, I>>(base?: I): RewardGaugesResponse {
    return RewardGaugesResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RewardGaugesResponse>, I>>(object: I): RewardGaugesResponse {
    const message = createBaseRewardGaugesResponse();
    message.coins = object.coins?.map((e) => Coin.fromPartial(e)) || [];
    message.withdrawnCoins = object.withdrawnCoins?.map((e) => Coin.fromPartial(e)) || [];
    return message;
  },
};

function createBaseQueryRewardGaugesResponse(): QueryRewardGaugesResponse {
  return { rewardGauges: {} };
}

export const QueryRewardGaugesResponse: MessageFns<QueryRewardGaugesResponse> = {
  encode(message: QueryRewardGaugesResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    Object.entries(message.rewardGauges).forEach(([key, value]) => {
      QueryRewardGaugesResponse_RewardGaugesEntry.encode({ key: key as any, value }, writer.uint32(10).fork()).join();
    });
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryRewardGaugesResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryRewardGaugesResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          const entry1 = QueryRewardGaugesResponse_RewardGaugesEntry.decode(reader, reader.uint32());
          if (entry1.value !== undefined) {
            message.rewardGauges[entry1.key] = entry1.value;
          }
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryRewardGaugesResponse {
    return {
      rewardGauges: isObject(object.rewardGauges)
        ? Object.entries(object.rewardGauges).reduce<{ [key: string]: RewardGaugesResponse }>((acc, [key, value]) => {
          acc[key] = RewardGaugesResponse.fromJSON(value);
          return acc;
        }, {})
        : {},
    };
  },

  toJSON(message: QueryRewardGaugesResponse): unknown {
    const obj: any = {};
    if (message.rewardGauges) {
      const entries = Object.entries(message.rewardGauges);
      if (entries.length > 0) {
        obj.rewardGauges = {};
        entries.forEach(([k, v]) => {
          obj.rewardGauges[k] = RewardGaugesResponse.toJSON(v);
        });
      }
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryRewardGaugesResponse>, I>>(base?: I): QueryRewardGaugesResponse {
    return QueryRewardGaugesResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryRewardGaugesResponse>, I>>(object: I): QueryRewardGaugesResponse {
    const message = createBaseQueryRewardGaugesResponse();
    message.rewardGauges = Object.entries(object.rewardGauges ?? {}).reduce<{ [key: string]: RewardGaugesResponse }>(
      (acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = RewardGaugesResponse.fromPartial(value);
        }
        return acc;
      },
      {},
    );
    return message;
  },
};

function createBaseQueryRewardGaugesResponse_RewardGaugesEntry(): QueryRewardGaugesResponse_RewardGaugesEntry {
  return { key: "", value: undefined };
}

export const QueryRewardGaugesResponse_RewardGaugesEntry: MessageFns<QueryRewardGaugesResponse_RewardGaugesEntry> = {
  encode(
    message: QueryRewardGaugesResponse_RewardGaugesEntry,
    writer: BinaryWriter = new BinaryWriter(),
  ): BinaryWriter {
    if (message.key !== "") {
      writer.uint32(10).string(message.key);
    }
    if (message.value !== undefined) {
      RewardGaugesResponse.encode(message.value, writer.uint32(18).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryRewardGaugesResponse_RewardGaugesEntry {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryRewardGaugesResponse_RewardGaugesEntry();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.key = reader.string();
          continue;
        }
        case 2: {
          if (tag !== 18) {
            break;
          }

          message.value = RewardGaugesResponse.decode(reader, reader.uint32());
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryRewardGaugesResponse_RewardGaugesEntry {
    return {
      key: isSet(object.key) ? globalThis.String(object.key) : "",
      value: isSet(object.value) ? RewardGaugesResponse.fromJSON(object.value) : undefined,
    };
  },

  toJSON(message: QueryRewardGaugesResponse_RewardGaugesEntry): unknown {
    const obj: any = {};
    if (message.key !== "") {
      obj.key = message.key;
    }
    if (message.value !== undefined) {
      obj.value = RewardGaugesResponse.toJSON(message.value);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryRewardGaugesResponse_RewardGaugesEntry>, I>>(
    base?: I,
  ): QueryRewardGaugesResponse_RewardGaugesEntry {
    return QueryRewardGaugesResponse_RewardGaugesEntry.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryRewardGaugesResponse_RewardGaugesEntry>, I>>(
    object: I,
  ): QueryRewardGaugesResponse_RewardGaugesEntry {
    const message = createBaseQueryRewardGaugesResponse_RewardGaugesEntry();
    message.key = object.key ?? "";
    message.value = (object.value !== undefined && object.value !== null)
      ? RewardGaugesResponse.fromPartial(object.value)
      : undefined;
    return message;
  },
};

function createBaseQueryBTCStakingGaugeRequest(): QueryBTCStakingGaugeRequest {
  return { height: 0 };
}

export const QueryBTCStakingGaugeRequest: MessageFns<QueryBTCStakingGaugeRequest> = {
  encode(message: QueryBTCStakingGaugeRequest, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.height !== 0) {
      writer.uint32(8).uint64(message.height);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryBTCStakingGaugeRequest {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryBTCStakingGaugeRequest();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 8) {
            break;
          }

          message.height = longToNumber(reader.uint64());
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryBTCStakingGaugeRequest {
    return { height: isSet(object.height) ? globalThis.Number(object.height) : 0 };
  },

  toJSON(message: QueryBTCStakingGaugeRequest): unknown {
    const obj: any = {};
    if (message.height !== 0) {
      obj.height = Math.round(message.height);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryBTCStakingGaugeRequest>, I>>(base?: I): QueryBTCStakingGaugeRequest {
    return QueryBTCStakingGaugeRequest.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryBTCStakingGaugeRequest>, I>>(object: I): QueryBTCStakingGaugeRequest {
    const message = createBaseQueryBTCStakingGaugeRequest();
    message.height = object.height ?? 0;
    return message;
  },
};

function createBaseBTCStakingGaugeResponse(): BTCStakingGaugeResponse {
  return { coins: [] };
}

export const BTCStakingGaugeResponse: MessageFns<BTCStakingGaugeResponse> = {
  encode(message: BTCStakingGaugeResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    for (const v of message.coins) {
      Coin.encode(v!, writer.uint32(10).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): BTCStakingGaugeResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseBTCStakingGaugeResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.coins.push(Coin.decode(reader, reader.uint32()));
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): BTCStakingGaugeResponse {
    return { coins: globalThis.Array.isArray(object?.coins) ? object.coins.map((e: any) => Coin.fromJSON(e)) : [] };
  },

  toJSON(message: BTCStakingGaugeResponse): unknown {
    const obj: any = {};
    if (message.coins?.length) {
      obj.coins = message.coins.map((e) => Coin.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<BTCStakingGaugeResponse>, I>>(base?: I): BTCStakingGaugeResponse {
    return BTCStakingGaugeResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<BTCStakingGaugeResponse>, I>>(object: I): BTCStakingGaugeResponse {
    const message = createBaseBTCStakingGaugeResponse();
    message.coins = object.coins?.map((e) => Coin.fromPartial(e)) || [];
    return message;
  },
};

function createBaseQueryBTCStakingGaugeResponse(): QueryBTCStakingGaugeResponse {
  return { gauge: undefined };
}

export const QueryBTCStakingGaugeResponse: MessageFns<QueryBTCStakingGaugeResponse> = {
  encode(message: QueryBTCStakingGaugeResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.gauge !== undefined) {
      BTCStakingGaugeResponse.encode(message.gauge, writer.uint32(10).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryBTCStakingGaugeResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryBTCStakingGaugeResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.gauge = BTCStakingGaugeResponse.decode(reader, reader.uint32());
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryBTCStakingGaugeResponse {
    return { gauge: isSet(object.gauge) ? BTCStakingGaugeResponse.fromJSON(object.gauge) : undefined };
  },

  toJSON(message: QueryBTCStakingGaugeResponse): unknown {
    const obj: any = {};
    if (message.gauge !== undefined) {
      obj.gauge = BTCStakingGaugeResponse.toJSON(message.gauge);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryBTCStakingGaugeResponse>, I>>(base?: I): QueryBTCStakingGaugeResponse {
    return QueryBTCStakingGaugeResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryBTCStakingGaugeResponse>, I>>(object: I): QueryBTCStakingGaugeResponse {
    const message = createBaseQueryBTCStakingGaugeResponse();
    message.gauge = (object.gauge !== undefined && object.gauge !== null)
      ? BTCStakingGaugeResponse.fromPartial(object.gauge)
      : undefined;
    return message;
  },
};

function createBaseQueryDelegatorWithdrawAddressRequest(): QueryDelegatorWithdrawAddressRequest {
  return { delegatorAddress: "" };
}

export const QueryDelegatorWithdrawAddressRequest: MessageFns<QueryDelegatorWithdrawAddressRequest> = {
  encode(message: QueryDelegatorWithdrawAddressRequest, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.delegatorAddress !== "") {
      writer.uint32(10).string(message.delegatorAddress);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryDelegatorWithdrawAddressRequest {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryDelegatorWithdrawAddressRequest();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.delegatorAddress = reader.string();
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryDelegatorWithdrawAddressRequest {
    return { delegatorAddress: isSet(object.delegatorAddress) ? globalThis.String(object.delegatorAddress) : "" };
  },

  toJSON(message: QueryDelegatorWithdrawAddressRequest): unknown {
    const obj: any = {};
    if (message.delegatorAddress !== "") {
      obj.delegatorAddress = message.delegatorAddress;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryDelegatorWithdrawAddressRequest>, I>>(
    base?: I,
  ): QueryDelegatorWithdrawAddressRequest {
    return QueryDelegatorWithdrawAddressRequest.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryDelegatorWithdrawAddressRequest>, I>>(
    object: I,
  ): QueryDelegatorWithdrawAddressRequest {
    const message = createBaseQueryDelegatorWithdrawAddressRequest();
    message.delegatorAddress = object.delegatorAddress ?? "";
    return message;
  },
};

function createBaseQueryDelegatorWithdrawAddressResponse(): QueryDelegatorWithdrawAddressResponse {
  return { withdrawAddress: "" };
}

export const QueryDelegatorWithdrawAddressResponse: MessageFns<QueryDelegatorWithdrawAddressResponse> = {
  encode(message: QueryDelegatorWithdrawAddressResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.withdrawAddress !== "") {
      writer.uint32(10).string(message.withdrawAddress);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryDelegatorWithdrawAddressResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryDelegatorWithdrawAddressResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.withdrawAddress = reader.string();
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryDelegatorWithdrawAddressResponse {
    return { withdrawAddress: isSet(object.withdrawAddress) ? globalThis.String(object.withdrawAddress) : "" };
  },

  toJSON(message: QueryDelegatorWithdrawAddressResponse): unknown {
    const obj: any = {};
    if (message.withdrawAddress !== "") {
      obj.withdrawAddress = message.withdrawAddress;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryDelegatorWithdrawAddressResponse>, I>>(
    base?: I,
  ): QueryDelegatorWithdrawAddressResponse {
    return QueryDelegatorWithdrawAddressResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryDelegatorWithdrawAddressResponse>, I>>(
    object: I,
  ): QueryDelegatorWithdrawAddressResponse {
    const message = createBaseQueryDelegatorWithdrawAddressResponse();
    message.withdrawAddress = object.withdrawAddress ?? "";
    return message;
  },
};

function createBaseQueryDelegationRewardsRequest(): QueryDelegationRewardsRequest {
  return { finalityProviderAddress: "", delegatorAddress: "" };
}

export const QueryDelegationRewardsRequest: MessageFns<QueryDelegationRewardsRequest> = {
  encode(message: QueryDelegationRewardsRequest, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.finalityProviderAddress !== "") {
      writer.uint32(10).string(message.finalityProviderAddress);
    }
    if (message.delegatorAddress !== "") {
      writer.uint32(18).string(message.delegatorAddress);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryDelegationRewardsRequest {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryDelegationRewardsRequest();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.finalityProviderAddress = reader.string();
          continue;
        }
        case 2: {
          if (tag !== 18) {
            break;
          }

          message.delegatorAddress = reader.string();
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryDelegationRewardsRequest {
    return {
      finalityProviderAddress: isSet(object.finalityProviderAddress)
        ? globalThis.String(object.finalityProviderAddress)
        : "",
      delegatorAddress: isSet(object.delegatorAddress) ? globalThis.String(object.delegatorAddress) : "",
    };
  },

  toJSON(message: QueryDelegationRewardsRequest): unknown {
    const obj: any = {};
    if (message.finalityProviderAddress !== "") {
      obj.finalityProviderAddress = message.finalityProviderAddress;
    }
    if (message.delegatorAddress !== "") {
      obj.delegatorAddress = message.delegatorAddress;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryDelegationRewardsRequest>, I>>(base?: I): QueryDelegationRewardsRequest {
    return QueryDelegationRewardsRequest.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryDelegationRewardsRequest>, I>>(
    object: I,
  ): QueryDelegationRewardsRequest {
    const message = createBaseQueryDelegationRewardsRequest();
    message.finalityProviderAddress = object.finalityProviderAddress ?? "";
    message.delegatorAddress = object.delegatorAddress ?? "";
    return message;
  },
};

function createBaseQueryDelegationRewardsResponse(): QueryDelegationRewardsResponse {
  return { rewards: [] };
}

export const QueryDelegationRewardsResponse: MessageFns<QueryDelegationRewardsResponse> = {
  encode(message: QueryDelegationRewardsResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    for (const v of message.rewards) {
      Coin.encode(v!, writer.uint32(10).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): QueryDelegationRewardsResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseQueryDelegationRewardsResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.rewards.push(Coin.decode(reader, reader.uint32()));
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): QueryDelegationRewardsResponse {
    return {
      rewards: globalThis.Array.isArray(object?.rewards) ? object.rewards.map((e: any) => Coin.fromJSON(e)) : [],
    };
  },

  toJSON(message: QueryDelegationRewardsResponse): unknown {
    const obj: any = {};
    if (message.rewards?.length) {
      obj.rewards = message.rewards.map((e) => Coin.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<QueryDelegationRewardsResponse>, I>>(base?: I): QueryDelegationRewardsResponse {
    return QueryDelegationRewardsResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<QueryDelegationRewardsResponse>, I>>(
    object: I,
  ): QueryDelegationRewardsResponse {
    const message = createBaseQueryDelegationRewardsResponse();
    message.rewards = object.rewards?.map((e) => Coin.fromPartial(e)) || [];
    return message;
  },
};

/** Query defines the gRPC querier service. */
export interface Query {
  /** Parameters queries the parameters of the module. */
  Params(request: QueryParamsRequest): Promise<QueryParamsResponse>;
  /** RewardGauge queries the reward gauge of a given stakeholder address */
  RewardGauges(request: QueryRewardGaugesRequest): Promise<QueryRewardGaugesResponse>;
  /** BTCStakingGauge queries the BTC staking gauge of a given height */
  BTCStakingGauge(request: QueryBTCStakingGaugeRequest): Promise<QueryBTCStakingGaugeResponse>;
  /** DelegatorWithdrawAddress queries withdraw address of a delegator. */
  DelegatorWithdrawAddress(
    request: QueryDelegatorWithdrawAddressRequest,
  ): Promise<QueryDelegatorWithdrawAddressResponse>;
  /**
   * DelegationRewards queries the delegation rewards of given finality provider
   * and delegator addresses
   */
  DelegationRewards(request: QueryDelegationRewardsRequest): Promise<QueryDelegationRewardsResponse>;
}

export const QueryServiceName = "babylon.incentive.Query";
export class QueryClientImpl implements Query {
  private readonly rpc: Rpc;
  private readonly service: string;
  constructor(rpc: Rpc, opts?: { service?: string }) {
    this.service = opts?.service || QueryServiceName;
    this.rpc = rpc;
    this.Params = this.Params.bind(this);
    this.RewardGauges = this.RewardGauges.bind(this);
    this.BTCStakingGauge = this.BTCStakingGauge.bind(this);
    this.DelegatorWithdrawAddress = this.DelegatorWithdrawAddress.bind(this);
    this.DelegationRewards = this.DelegationRewards.bind(this);
  }
  Params(request: QueryParamsRequest): Promise<QueryParamsResponse> {
    const data = QueryParamsRequest.encode(request).finish();
    const promise = this.rpc.request(this.service, "Params", data);
    return promise.then((data) => QueryParamsResponse.decode(new BinaryReader(data)));
  }

  RewardGauges(request: QueryRewardGaugesRequest): Promise<QueryRewardGaugesResponse> {
    const data = QueryRewardGaugesRequest.encode(request).finish();
    const promise = this.rpc.request(this.service, "RewardGauges", data);
    return promise.then((data) => QueryRewardGaugesResponse.decode(new BinaryReader(data)));
  }

  BTCStakingGauge(request: QueryBTCStakingGaugeRequest): Promise<QueryBTCStakingGaugeResponse> {
    const data = QueryBTCStakingGaugeRequest.encode(request).finish();
    const promise = this.rpc.request(this.service, "BTCStakingGauge", data);
    return promise.then((data) => QueryBTCStakingGaugeResponse.decode(new BinaryReader(data)));
  }

  DelegatorWithdrawAddress(
    request: QueryDelegatorWithdrawAddressRequest,
  ): Promise<QueryDelegatorWithdrawAddressResponse> {
    const data = QueryDelegatorWithdrawAddressRequest.encode(request).finish();
    const promise = this.rpc.request(this.service, "DelegatorWithdrawAddress", data);
    return promise.then((data) => QueryDelegatorWithdrawAddressResponse.decode(new BinaryReader(data)));
  }

  DelegationRewards(request: QueryDelegationRewardsRequest): Promise<QueryDelegationRewardsResponse> {
    const data = QueryDelegationRewardsRequest.encode(request).finish();
    const promise = this.rpc.request(this.service, "DelegationRewards", data);
    return promise.then((data) => QueryDelegationRewardsResponse.decode(new BinaryReader(data)));
  }
}

interface Rpc {
  request(service: string, method: string, data: Uint8Array): Promise<Uint8Array>;
}

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function longToNumber(int64: { toString(): string }): number {
  const num = globalThis.Number(int64.toString());
  if (num > globalThis.Number.MAX_SAFE_INTEGER) {
    throw new globalThis.Error("Value is larger than Number.MAX_SAFE_INTEGER");
  }
  if (num < globalThis.Number.MIN_SAFE_INTEGER) {
    throw new globalThis.Error("Value is smaller than Number.MIN_SAFE_INTEGER");
  }
  return num;
}

function isObject(value: any): boolean {
  return typeof value === "object" && value !== null;
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}

export interface MessageFns<T> {
  encode(message: T, writer?: BinaryWriter): BinaryWriter;
  decode(input: BinaryReader | Uint8Array, length?: number): T;
  fromJSON(object: any): T;
  toJSON(message: T): unknown;
  create<I extends Exact<DeepPartial<T>, I>>(base?: I): T;
  fromPartial<I extends Exact<DeepPartial<T>, I>>(object: I): T;
}
