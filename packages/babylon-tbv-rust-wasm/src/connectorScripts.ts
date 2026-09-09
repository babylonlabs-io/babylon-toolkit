import { secp256k1 } from '@noble/curves/secp256k1.js';
import { script as bscript, opcodes } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';

export const TAPSCRIPT_LEAF_VERSION = 0xc0;
export const MAX_U16 = 0xffff;
const SEC1_EVEN_Y_PREFIX = 0x02;
type ScriptChunk = number | Buffer;

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

export function normalizeXOnlyKey(value: string, label: string): string {
  const key = stripHexPrefix(value).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) {
    throw new Error(`${label} must be a 32-byte x-only public key.`);
  }

  try {
    secp256k1.Point.fromBytes(
      Buffer.concat([
        Buffer.from([SEC1_EVEN_Y_PREFIX]),
        Buffer.from(key, 'hex'),
      ]),
    );
  } catch {
    throw new Error(`${label} is not a secp256k1 x-coordinate.`);
  }

  return key;
}

export function normalizeKeyGroup(
  values: readonly string[],
  label: string,
): string[] {
  if (values.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  const keys = values
    .map((value, index) => normalizeXOnlyKey(value, `${label}[${index}]`))
    .sort();
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${label} must not contain duplicate keys.`);
  }
  return keys;
}

export function nOfNChunks(
  keys: readonly string[],
  verify: boolean,
): ScriptChunk[] {
  const chunks: ScriptChunk[] = [];
  keys.forEach((key, index) => {
    chunks.push(
      Buffer.from(key, 'hex'),
      index === 0 ? opcodes.OP_CHECKSIG : opcodes.OP_CHECKSIGADD,
    );
  });
  chunks.push(
    bscript.number.encode(keys.length),
    verify ? opcodes.OP_NUMEQUALVERIFY : opcodes.OP_NUMEQUAL,
  );
  return chunks;
}
