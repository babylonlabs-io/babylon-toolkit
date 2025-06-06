// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// versions:
//   protoc-gen-ts_proto  v2.6.1
//   protoc               unknown
// source: babylon/checkpointing/v1/tx.proto

/* eslint-disable */
import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { MsgCreateValidator } from "../../../cosmos/staking/v1beta1/tx";
import { BlsKey } from "./bls_key";

export const protobufPackage = "babylon.checkpointing.v1";

/** MsgWrappedCreateValidator defines a wrapped message to create a validator */
export interface MsgWrappedCreateValidator {
  key: BlsKey | undefined;
  msgCreateValidator: MsgCreateValidator | undefined;
}

/**
 * MsgWrappedCreateValidatorResponse defines the MsgWrappedCreateValidator
 * response type
 */
export interface MsgWrappedCreateValidatorResponse {
}

function createBaseMsgWrappedCreateValidator(): MsgWrappedCreateValidator {
  return { key: undefined, msgCreateValidator: undefined };
}

export const MsgWrappedCreateValidator: MessageFns<MsgWrappedCreateValidator> = {
  encode(message: MsgWrappedCreateValidator, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.key !== undefined) {
      BlsKey.encode(message.key, writer.uint32(10).fork()).join();
    }
    if (message.msgCreateValidator !== undefined) {
      MsgCreateValidator.encode(message.msgCreateValidator, writer.uint32(18).fork()).join();
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): MsgWrappedCreateValidator {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgWrappedCreateValidator();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.key = BlsKey.decode(reader, reader.uint32());
          continue;
        }
        case 2: {
          if (tag !== 18) {
            break;
          }

          message.msgCreateValidator = MsgCreateValidator.decode(reader, reader.uint32());
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

  fromJSON(object: any): MsgWrappedCreateValidator {
    return {
      key: isSet(object.key) ? BlsKey.fromJSON(object.key) : undefined,
      msgCreateValidator: isSet(object.msgCreateValidator)
        ? MsgCreateValidator.fromJSON(object.msgCreateValidator)
        : undefined,
    };
  },

  toJSON(message: MsgWrappedCreateValidator): unknown {
    const obj: any = {};
    if (message.key !== undefined) {
      obj.key = BlsKey.toJSON(message.key);
    }
    if (message.msgCreateValidator !== undefined) {
      obj.msgCreateValidator = MsgCreateValidator.toJSON(message.msgCreateValidator);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<MsgWrappedCreateValidator>, I>>(base?: I): MsgWrappedCreateValidator {
    return MsgWrappedCreateValidator.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<MsgWrappedCreateValidator>, I>>(object: I): MsgWrappedCreateValidator {
    const message = createBaseMsgWrappedCreateValidator();
    message.key = (object.key !== undefined && object.key !== null) ? BlsKey.fromPartial(object.key) : undefined;
    message.msgCreateValidator = (object.msgCreateValidator !== undefined && object.msgCreateValidator !== null)
      ? MsgCreateValidator.fromPartial(object.msgCreateValidator)
      : undefined;
    return message;
  },
};

function createBaseMsgWrappedCreateValidatorResponse(): MsgWrappedCreateValidatorResponse {
  return {};
}

export const MsgWrappedCreateValidatorResponse: MessageFns<MsgWrappedCreateValidatorResponse> = {
  encode(_: MsgWrappedCreateValidatorResponse, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): MsgWrappedCreateValidatorResponse {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgWrappedCreateValidatorResponse();
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

  fromJSON(_: any): MsgWrappedCreateValidatorResponse {
    return {};
  },

  toJSON(_: MsgWrappedCreateValidatorResponse): unknown {
    const obj: any = {};
    return obj;
  },

  create<I extends Exact<DeepPartial<MsgWrappedCreateValidatorResponse>, I>>(
    base?: I,
  ): MsgWrappedCreateValidatorResponse {
    return MsgWrappedCreateValidatorResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<MsgWrappedCreateValidatorResponse>, I>>(
    _: I,
  ): MsgWrappedCreateValidatorResponse {
    const message = createBaseMsgWrappedCreateValidatorResponse();
    return message;
  },
};

/** Msg defines the checkpointing Msg service. */
export interface Msg {
  /** WrappedCreateValidator defines a method for registering a new validator */
  WrappedCreateValidator(request: MsgWrappedCreateValidator): Promise<MsgWrappedCreateValidatorResponse>;
}

export const MsgServiceName = "babylon.checkpointing.v1.Msg";
export class MsgClientImpl implements Msg {
  private readonly rpc: Rpc;
  private readonly service: string;
  constructor(rpc: Rpc, opts?: { service?: string }) {
    this.service = opts?.service || MsgServiceName;
    this.rpc = rpc;
    this.WrappedCreateValidator = this.WrappedCreateValidator.bind(this);
  }
  WrappedCreateValidator(request: MsgWrappedCreateValidator): Promise<MsgWrappedCreateValidatorResponse> {
    const data = MsgWrappedCreateValidator.encode(request).finish();
    const promise = this.rpc.request(this.service, "WrappedCreateValidator", data);
    return promise.then((data) => MsgWrappedCreateValidatorResponse.decode(new BinaryReader(data)));
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
