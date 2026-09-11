import { secp256k1 } from '@noble/curves/secp256k1.js';
import { script as bscript, opcodes } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';

// BIP-341: the leaf version for a Taproot script.
export const TAPSCRIPT_LEAF_VERSION = 0xc0;
// The engine stores every connector timelock as a Rust u16, so this is the
// largest value it can hold without truncation.
export const MAX_U16 = 0xffff;
// SEC1: the compressed-point prefix for an even y-coordinate. An x-only key
// is defined to have one, so this rebuilds the point the curve check needs.
const SEC1_EVEN_Y_PREFIX = 0x02;
type ScriptChunk = number | Buffer;

export function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

// Accepts exactly what the engine accepts. A 0x prefix is rejected here as
// XOnlyPublicKey::from_str rejects it, so neither side of the cross-check can
// derive a script from an input the other refuses. Callers that hold prefixed
// hex normalize it before they get here.
export function normalizeXOnlyKey(value: string, label: string): string {
  const key = value.toLowerCase();
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

// btc-vault crates/vault/src/connectors/script_utils.rs
// build_m_of_n_multisig_script at 2c1177ec, 27c0062b, and e1e50f66 encodes
// every signer, then compares the count with the key total.
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
