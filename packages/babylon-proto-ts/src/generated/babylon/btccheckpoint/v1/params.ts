// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// versions:
//   protoc-gen-ts_proto  v2.6.1
//   protoc               unknown
// source: babylon/btccheckpoint/v1/params.proto

/* eslint-disable */
import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";

export const protobufPackage = "babylon.btccheckpoint.v1";

/** Params defines the parameters for the module. */
export interface Params {
  /**
   * btc_confirmation_depth is the confirmation depth in BTC.
   * A block is considered irreversible only when it is at least k-deep in BTC
   * (k in research paper)
   */
  btcConfirmationDepth: number;
  /**
   * checkpoint_finalization_timeout is the maximum time window (measured in BTC
   * blocks) between a checkpoint
   * - being submitted to BTC, and
   * - being reported back to BBN
   * If a checkpoint has not been reported back within w BTC blocks, then BBN
   * has dishonest majority and is stalling checkpoints (w in research paper)
   */
  checkpointFinalizationTimeout: number;
  /**
   * 4byte tag in hex format, required to be present in the OP_RETURN transaction
   * related to babylon
   */
  checkpointTag: string;
}

function createBaseParams(): Params {
  return { btcConfirmationDepth: 0, checkpointFinalizationTimeout: 0, checkpointTag: "" };
}

export const Params: MessageFns<Params> = {
  encode(message: Params, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.btcConfirmationDepth !== 0) {
      writer.uint32(8).uint32(message.btcConfirmationDepth);
    }
    if (message.checkpointFinalizationTimeout !== 0) {
      writer.uint32(16).uint32(message.checkpointFinalizationTimeout);
    }
    if (message.checkpointTag !== "") {
      writer.uint32(26).string(message.checkpointTag);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): Params {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseParams();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 8) {
            break;
          }

          message.btcConfirmationDepth = reader.uint32();
          continue;
        }
        case 2: {
          if (tag !== 16) {
            break;
          }

          message.checkpointFinalizationTimeout = reader.uint32();
          continue;
        }
        case 3: {
          if (tag !== 26) {
            break;
          }

          message.checkpointTag = reader.string();
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

  fromJSON(object: any): Params {
    return {
      btcConfirmationDepth: isSet(object.btcConfirmationDepth) ? globalThis.Number(object.btcConfirmationDepth) : 0,
      checkpointFinalizationTimeout: isSet(object.checkpointFinalizationTimeout)
        ? globalThis.Number(object.checkpointFinalizationTimeout)
        : 0,
      checkpointTag: isSet(object.checkpointTag) ? globalThis.String(object.checkpointTag) : "",
    };
  },

  toJSON(message: Params): unknown {
    const obj: any = {};
    if (message.btcConfirmationDepth !== 0) {
      obj.btcConfirmationDepth = Math.round(message.btcConfirmationDepth);
    }
    if (message.checkpointFinalizationTimeout !== 0) {
      obj.checkpointFinalizationTimeout = Math.round(message.checkpointFinalizationTimeout);
    }
    if (message.checkpointTag !== "") {
      obj.checkpointTag = message.checkpointTag;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Params>, I>>(base?: I): Params {
    return Params.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Params>, I>>(object: I): Params {
    const message = createBaseParams();
    message.btcConfirmationDepth = object.btcConfirmationDepth ?? 0;
    message.checkpointFinalizationTimeout = object.checkpointFinalizationTimeout ?? 0;
    message.checkpointTag = object.checkpointTag ?? "";
    return message;
  },
};

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
