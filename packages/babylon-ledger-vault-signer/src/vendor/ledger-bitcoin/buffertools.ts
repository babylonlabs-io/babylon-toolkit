/**
 * Vendored from the Ledger Bitcoin JS client (Apache-2.0).
 *
 * Upstream:        https://github.com/LedgerHQ/app-bitcoin (formerly app-bitcoin-new)
 * File:            bitcoin_client_js/src/lib/buffertools.ts
 * Version:         ledger-bitcoin@0.3.0 (npm gitHead 0a9e9e141f3340d29e7c6181177d4e5e9483a9f7)
 * Upstream sha256: 0d48d8d7cd25c0fa365bb843004e0491b92a3fb519fc7590233418bd17c7fcfc
 * Vendored:        2026-08-14
 * License:         Apache-2.0 — see ./LICENSE (verbatim upstream copy)
 * Modifications:   explicit `import { Buffer } from "buffer"` (no implicit Node
 *                  global — this package ships to the browser); named the
 *                  `MAX_SAFE_INTEGER_TOP_BYTE` 2^53 bound in unsafeFrom64bitLE;
 *                  fixed the "Bufffer of lenght" typo; `slice` → `subarray` in
 *                  readSlice; defensive strict-null guards on byte indexing
 *                  (behaviour-preserving); `==` → `===`; formatting.
 */

import { Buffer } from "buffer";

import { createVarint, parseVarint, sanitizeBigintToNumber } from "./varint";

// 2^53 − 1 (Number.MAX_SAFE_INTEGER) = 0x001f_ffff_ffff_ffff in 8-byte LE: any
// value with byte 7 non-zero or byte 6 above 0x1f exceeds the safe range.
const MAX_SAFE_INTEGER_TOP_BYTE = 0x1f;

export function unsafeTo64bitLE(n: number): Buffer {
  // we want to represent the input as a 8-bytes array
  if (n > Number.MAX_SAFE_INTEGER) {
    throw new Error("Can't convert numbers > MAX_SAFE_INT");
  }
  const byteArray = Buffer.alloc(8, 0);
  for (let index = 0; index < byteArray.length; index++) {
    const byte = n & 0xff;
    byteArray[index] = byte;
    n = (n - byte) / 256;
  }
  return byteArray;
}

export function unsafeFrom64bitLE(byteArray: Buffer): number {
  let value = 0;
  if (byteArray.length !== 8) {
    throw new Error("Expected Buffer of length 8");
  }
  if (byteArray[7] !== 0) {
    throw new Error("Can't encode numbers > MAX_SAFE_INT");
  }
  const topByte = byteArray[6];
  if (topByte === undefined || topByte > MAX_SAFE_INTEGER_TOP_BYTE) {
    throw new Error("Can't encode numbers > MAX_SAFE_INT");
  }
  for (let i = byteArray.length - 1; i >= 0; i--) {
    const byte = byteArray[i];
    if (byte === undefined) {
      throw new Error("Buffer too small");
    }
    value = value * 256 + byte;
  }
  return value;
}

export class BufferWriter {
  private bufs: Buffer[] = [];

  write(alloc: number, fn: (b: Buffer) => void): void {
    const b = Buffer.alloc(alloc);
    fn(b);
    this.bufs.push(b);
  }

  writeUInt8(i: number): void {
    this.write(1, (b) => b.writeUInt8(i, 0));
  }

  writeInt32(i: number): void {
    this.write(4, (b) => b.writeInt32LE(i, 0));
  }

  writeUInt32(i: number): void {
    this.write(4, (b) => b.writeUInt32LE(i, 0));
  }

  writeUInt64(i: number): void {
    const bytes = unsafeTo64bitLE(i);
    this.writeSlice(bytes);
  }

  writeVarInt(i: number): void {
    this.bufs.push(createVarint(i));
  }

  writeSlice(slice: Buffer): void {
    this.bufs.push(Buffer.from(slice));
  }

  writeVarSlice(slice: Buffer): void {
    this.writeVarInt(slice.length);
    this.writeSlice(slice);
  }

  buffer(): Buffer {
    return Buffer.concat(this.bufs);
  }
}

export class BufferReader {
  constructor(
    public readonly buffer: Buffer,
    public offset: number = 0,
  ) {}

  available(): number {
    return this.buffer.length - this.offset;
  }

  readUInt8(): number {
    const result = this.buffer.readUInt8(this.offset);
    this.offset++;
    return result;
  }

  readInt32(): number {
    const result = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return result;
  }

  readUInt32(): number {
    const result = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return result;
  }

  readUInt64(): number {
    const buf = this.readSlice(8);
    return unsafeFrom64bitLE(buf);
  }

  readVarInt(): bigint {
    const [vi, vi_size] = parseVarint(this.buffer, this.offset);
    this.offset += vi_size;
    return vi;
  }

  readSlice(n: number): Buffer {
    if (this.buffer.length < this.offset + n) {
      throw new Error("Cannot read slice out of bounds");
    }
    const result = this.buffer.subarray(this.offset, this.offset + n);
    this.offset += n;
    return result;
  }

  readVarSlice(): Buffer {
    const n = sanitizeBigintToNumber(this.readVarInt());
    return this.readSlice(n);
  }

  readVector(): readonly Buffer[] {
    const count = this.readVarInt();
    const vector: Buffer[] = [];
    for (let i = 0; i < count; i++) vector.push(this.readVarSlice());
    return vector;
  }
}
