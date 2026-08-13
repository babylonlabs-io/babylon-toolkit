import { sha256 } from "@noble/hashes/sha2.js";

import { BTC_MAINNET, getBTCNetwork } from "@/config/network";

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GENERATORS = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
] as const;
const BECH32_CHECKSUM = 1;
const BECH32M_CHECKSUM = 0x2bc830a3;
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeHex(value: string): Uint8Array {
  const cleanHex = value.replace(/^0x/i, "");
  if (cleanHex.length === 0 || cleanHex.length % 2 !== 0) {
    throw new Error(
      `Invalid scriptPubKey hex length: ${cleanHex.length} (must be non-empty and even)`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error("Invalid scriptPubKey hex: contains non-hex characters");
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function base58Check(version: number, payload: Uint8Array): string {
  const body = concatBytes(Uint8Array.of(version), payload);
  const checksum = sha256(sha256(body)).slice(0, 4);
  const encoded = concatBytes(body, checksum);

  let value = 0n;
  for (const byte of encoded) value = (value << 8n) | BigInt(byte);

  let result = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    value /= 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }
  for (const byte of encoded) {
    if (byte !== 0) break;
    result = `1${result}`;
  }
  return result;
}

function bech32Polymod(values: readonly number[]): number {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < BECH32_GENERATORS.length; i++) {
      if ((high >>> i) & 1) checksum ^= BECH32_GENERATORS[i];
    }
  }
  return checksum >>> 0;
}

function expandHrp(hrp: string): number[] {
  return [
    ...Array.from(hrp, (character) => character.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, (character) => character.charCodeAt(0) & 31),
  ];
}

function convertBits(bytes: Uint8Array): number[] {
  const result: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = ((accumulator << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) result.push((accumulator << (5 - bits)) & 31);
  return result;
}

function encodeWitnessAddress(
  hrp: string,
  version: number,
  program: Uint8Array,
): string {
  const data = [version, ...convertBits(program)];
  const encodingConstant = version === 0 ? BECH32_CHECKSUM : BECH32M_CHECKSUM;
  const polymod =
    bech32Polymod([...expandHrp(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^
    encodingConstant;
  const checksum = Array.from(
    { length: 6 },
    (_, index) => (polymod >>> (5 * (5 - index))) & 31,
  );
  return `${hrp}1${[...data, ...checksum]
    .map((value) => BECH32_CHARSET[value])
    .join("")}`;
}

/**
 * Decode a standard Bitcoin scriptPubKey without loading bitcoinjs-lib or its
 * ECC implementation. This read-only path covers the registered payout script
 * templates accepted by the app: P2PKH, P2SH, SegWit v0 and Taproot.
 */
export function scriptPubKeyHexToBtcAddress(scriptPubKeyHex: string): string {
  const script = decodeHex(scriptPubKeyHex);
  const mainnet = getBTCNetwork() === BTC_MAINNET;

  // OP_DUP OP_HASH160 PUSH20 <hash> OP_EQUALVERIFY OP_CHECKSIG
  if (
    script.length === 25 &&
    script[0] === 0x76 &&
    script[1] === 0xa9 &&
    script[2] === 0x14 &&
    script[23] === 0x88 &&
    script[24] === 0xac
  ) {
    return base58Check(mainnet ? 0x00 : 0x6f, script.slice(3, 23));
  }

  // OP_HASH160 PUSH20 <hash> OP_EQUAL
  if (
    script.length === 23 &&
    script[0] === 0xa9 &&
    script[1] === 0x14 &&
    script[22] === 0x87
  ) {
    return base58Check(mainnet ? 0x05 : 0xc4, script.slice(2, 22));
  }

  // Native witness program: OP_0 or OP_1..OP_16, followed by a direct push.
  const version =
    script[0] === 0x00
      ? 0
      : script[0] >= 0x51 && script[0] <= 0x60
        ? script[0] - 0x50
        : undefined;
  const programLength = script[1];
  if (
    version !== undefined &&
    programLength >= 2 &&
    programLength <= 40 &&
    script.length === programLength + 2 &&
    (version !== 0 || programLength === 20 || programLength === 32)
  ) {
    return encodeWitnessAddress(
      mainnet ? "bc" : "tb",
      version,
      script.slice(2),
    );
  }

  throw new Error("Unsupported Bitcoin scriptPubKey");
}
