/**
 * Minimal CBOR decoder — the read-side counterpart to {@link ./cbor}.
 *
 * Decodes only the subset needed to verify a vault-provider CWT bearer
 * token (RFC 8392) wrapped in a COSE Sign1 envelope (RFC 8152): tagged
 * values, definite-length arrays and maps, byte/text strings, and
 * unsigned/negative integers. Indefinite-length items, floats, and
 * big-number tags are intentionally rejected — the issuer
 * (btc-vault's `coset`/`ciborium` stack) never emits them for this
 * shape, so accepting them would only widen the parser's attack
 * surface.
 *
 * The decoder is a cursor over a single buffer. {@link CborReader.pos}
 * is public so callers can slice the exact encoded byte range of an
 * item (head + content) — required to reconstruct the COSE
 * `Sig_structure` byte-for-byte from the token's own protected-header
 * and payload byte strings.
 *
 * @module tbv/core/clients/vault-provider/auth/cborDecode
 */

/** CBOR major types (the high 3 bits of the initial byte). */
const MAJOR_UNSIGNED_INT = 0;
const MAJOR_NEGATIVE_INT = 1;
const MAJOR_BYTE_STRING = 2;
const MAJOR_TEXT_STRING = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;
const MAJOR_TAG = 6;
const MAJOR_SIMPLE = 7;

/**
 * Smallest additional-info value that introduces a multi-byte argument
 * (24 ⇒ 1 byte, 25 ⇒ 2, 26 ⇒ 4, 27 ⇒ 8 — i.e. `1 << (info - 24)`).
 */
const ARG_IN_NEXT_1_BYTE = 24;
/** Additional-info ≥ this (28..31) is reserved/indefinite — unsupported. */
const ARG_RESERVED_MIN = 28;

/** Major-7 simple values we accept. */
const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;

/**
 * Maximum CBOR nesting depth. Mirrors the issuer's recursion cap (256 in
 * btc-vault's `ciborium` stack). The COSE protected header is decoded
 * *before* the signature is verified, so without this bound a
 * malicious/MITM'd VP could send a deeply-nested blob and crash token
 * acquisition with an uncatchable stack overflow. Far below the JS call
 * stack limit, so it converts that DoS into a catchable decode error.
 */
const MAX_NESTING_DEPTH = 256;

/** A decoded CBOR data item. Maps preserve key insertion order. */
export type CborValue =
  | number
  | bigint
  | string
  | Uint8Array
  | boolean
  | null
  | CborValue[]
  | Map<CborValue, CborValue>
  | CborTagged;

/** A CBOR tagged value (major type 6). */
export interface CborTagged {
  tag: number;
  value: CborValue;
}

/** Parsed initial-byte header: major type plus its decoded argument. */
export interface CborHead {
  major: number;
  /** The header argument (length, value, tag number, …) as a number. */
  arg: number;
}

export class CborDecodeError extends Error {
  constructor(message: string) {
    super(`CBOR decode: ${message}`);
    this.name = "CborDecodeError";
  }
}

/**
 * Cursor-based reader over a CBOR buffer. Not reusable across buffers —
 * construct one per decode.
 */
export class CborReader {
  readonly buf: Uint8Array;
  /** Current read offset. Public so callers can slice encoded sub-ranges. */
  pos = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  private nextByte(): number {
    if (this.pos >= this.buf.length) {
      throw new CborDecodeError("unexpected end of input");
    }
    return this.buf[this.pos++];
  }

  /**
   * Read an initial byte and its argument. Rejects indefinite-length
   * and reserved additional-info encodings. Arguments wider than
   * {@link Number.MAX_SAFE_INTEGER} are rejected — none of the token's
   * lengths, tags, or timestamps approach that bound.
   */
  readHead(): CborHead {
    const initial = this.nextByte();
    const major = initial >> 5;
    const info = initial & 0x1f;

    if (info < ARG_IN_NEXT_1_BYTE) {
      return { major, arg: info };
    }
    if (info >= ARG_RESERVED_MIN) {
      throw new CborDecodeError(
        `unsupported additional info ${info} (indefinite-length or reserved)`,
      );
    }

    const byteCount = 1 << (info - ARG_IN_NEXT_1_BYTE);

    let value = 0n;
    for (let i = 0; i < byteCount; i++) {
      value = (value << 8n) | BigInt(this.nextByte());
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CborDecodeError(`argument ${value} exceeds safe integer range`);
    }
    return { major, arg: Number(value) };
  }

  /** Read `length` raw bytes as a sub-array view into the backing buffer. */
  private readBytes(length: number): Uint8Array {
    if (this.pos + length > this.buf.length) {
      throw new CborDecodeError("length overruns end of input");
    }
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  /**
   * Read a byte string (major type 2), returning its content bytes.
   * Throws if the next item is not a byte string.
   */
  readByteString(): Uint8Array {
    const head = this.readHead();
    if (head.major !== MAJOR_BYTE_STRING) {
      throw new CborDecodeError(
        `expected byte string (major ${MAJOR_BYTE_STRING}), got major ${head.major}`,
      );
    }
    return this.readBytes(head.arg);
  }

  /**
   * Read the next complete data item as a decoded {@link CborValue}.
   *
   * `depth` tracks the current nesting level so a deeply-nested blob is
   * rejected with a {@link CborDecodeError} rather than overflowing the
   * native call stack (see {@link MAX_NESTING_DEPTH}).
   */
  readValue(depth = 0): CborValue {
    if (depth > MAX_NESTING_DEPTH) {
      throw new CborDecodeError(
        `nesting exceeds maximum depth ${MAX_NESTING_DEPTH}`,
      );
    }
    const head = this.readHead();
    switch (head.major) {
      case MAJOR_UNSIGNED_INT:
        return head.arg;
      case MAJOR_NEGATIVE_INT:
        // RFC 8949 §3.1: the encoded argument n represents -1 - n.
        return -1 - head.arg;
      case MAJOR_BYTE_STRING:
        return this.readBytes(head.arg);
      case MAJOR_TEXT_STRING:
        return new TextDecoder("utf-8", { fatal: true }).decode(
          this.readBytes(head.arg),
        );
      case MAJOR_ARRAY: {
        const items: CborValue[] = [];
        for (let i = 0; i < head.arg; i++) {
          items.push(this.readValue(depth + 1));
        }
        return items;
      }
      case MAJOR_MAP: {
        const map = new Map<CborValue, CborValue>();
        for (let i = 0; i < head.arg; i++) {
          const key = this.readValue(depth + 1);
          const value = this.readValue(depth + 1);
          map.set(key, value);
        }
        return map;
      }
      case MAJOR_TAG:
        return { tag: head.arg, value: this.readValue(depth + 1) };
      case MAJOR_SIMPLE:
        if (head.arg === SIMPLE_FALSE) return false;
        if (head.arg === SIMPLE_TRUE) return true;
        if (head.arg === SIMPLE_NULL) return null;
        throw new CborDecodeError(
          `unsupported simple/float value ${head.arg}`,
        );
      default:
        throw new CborDecodeError(`unsupported major type ${head.major}`);
    }
  }
}

/**
 * Decode a single CBOR item from `bytes`, rejecting any trailing bytes.
 *
 * Used to parse the COSE protected header and CWT claims set — both are
 * exactly one top-level item, so a valid prefix followed by extra bytes
 * is a malformed structure, not a benign tail. Strict consumption keeps
 * the parser from silently accepting a token a stricter CWT/COSE
 * consumer would interpret differently.
 */
export function decodeCbor(bytes: Uint8Array): CborValue {
  const reader = new CborReader(bytes);
  const value = reader.readValue();
  if (reader.pos !== bytes.length) {
    throw new CborDecodeError("trailing bytes after top-level item");
  }
  return value;
}
