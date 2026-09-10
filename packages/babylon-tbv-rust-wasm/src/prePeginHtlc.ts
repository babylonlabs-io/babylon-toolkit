import * as ecc from '@bitcoin-js/tiny-secp256k1-asmjs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  initEccLib,
  script as bscript,
  opcodes,
  payments,
} from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { tapInternalPubkey } from './constants.js';
import type { HtlcConnectorParams } from './types.js';

// bitcoinjs-lib keeps one module-global ECC backend. Install it once, when
// this lazily-imported module is first evaluated, rather than mutating that
// global inside a derivation.
initEccLib(ecc);

// BIP-341: the leaf version for a Taproot script.
const TAPSCRIPT_LEAF_VERSION = 0xc0;

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

const PREIMAGE_LENGTH_BYTES = 32;
const MAX_U16 = 0xffff;
const SEC1_EVEN_Y_PREFIX = 0x02;

type ScriptChunk = number | Buffer;

export type PrePeginHtlcParams = Pick<
  HtlcConnectorParams,
  | 'depositorPubkey'
  | 'vaultProviderPubkey'
  | 'vaultKeeperPubkeys'
  | 'universalChallengerPubkeys'
  | 'timelockRefund'
>;

export interface ExpectedPrePeginHtlc {
  hashlockScript: Buffer;
  hashlockControlBlock: Buffer;
  refundScript: Buffer;
  refundControlBlock: Buffer;
  scriptPubKey: Buffer;
  tapMerkleRoot: Buffer;
}

function normalizeXOnlyKey(value: string, label: string): string {
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

function normalizeKeyGroup(values: readonly string[], label: string): string[] {
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

function nOfNChunks(keys: readonly string[], verify: boolean): ScriptChunk[] {
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

/**
 * Derive the canonical Pre-PegIn HTLC without using vault WASM output.
 */
export function deriveExpectedPrePeginHtlc(
  params: PrePeginHtlcParams,
  hashlock: string,
): ExpectedPrePeginHtlc {

  const depositor = normalizeXOnlyKey(
    params.depositorPubkey,
    'depositorPubkey',
  );
  const vaultProvider = normalizeXOnlyKey(
    params.vaultProviderPubkey,
    'vaultProviderPubkey',
  );
  const vaultKeepers = normalizeKeyGroup(
    params.vaultKeeperPubkeys,
    'vaultKeeperPubkeys',
  );
  const universalChallengers = normalizeKeyGroup(
    params.universalChallengerPubkeys,
    'universalChallengerPubkeys',
  );
  const cleanHashlock = stripHexPrefix(hashlock).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanHashlock)) {
    throw new Error('hashlock must be 32 bytes.');
  }
  if (
    !Number.isInteger(params.timelockRefund) ||
    params.timelockRefund < 1 ||
    params.timelockRefund > MAX_U16
  ) {
    throw new Error('timelockRefund must be an integer from 1 to 65535.');
  }

  const hashlockScript = bscript.compile([
    opcodes.OP_SIZE,
    bscript.number.encode(PREIMAGE_LENGTH_BYTES),
    opcodes.OP_EQUALVERIFY,
    opcodes.OP_SHA256,
    Buffer.from(cleanHashlock, 'hex'),
    opcodes.OP_EQUALVERIFY,
    Buffer.from(depositor, 'hex'),
    opcodes.OP_CHECKSIGVERIFY,
    Buffer.from(vaultProvider, 'hex'),
    opcodes.OP_CHECKSIGVERIFY,
    ...nOfNChunks(vaultKeepers, true),
    ...nOfNChunks(universalChallengers, false),
  ]);
  const refundScript = bscript.compile([
    Buffer.from(depositor, 'hex'),
    opcodes.OP_CHECKSIGVERIFY,
    bscript.number.encode(params.timelockRefund),
    opcodes.OP_CHECKSEQUENCEVERIFY,
  ]);
  const scriptTree: [
    { output: Buffer; version: number },
    { output: Buffer; version: number },
  ] = [
    { output: hashlockScript, version: TAPSCRIPT_LEAF_VERSION },
    { output: refundScript, version: TAPSCRIPT_LEAF_VERSION },
  ];
  const { hash, output, witness } = payments.p2tr({
    internalPubkey: Buffer.from(tapInternalPubkey),
    scriptTree,
    redeem: {
      output: hashlockScript,
      redeemVersion: TAPSCRIPT_LEAF_VERSION,
    },
  });
  const hashlockControlBlock = witness?.[witness.length - 1];
  const refundPayment = payments.p2tr({
    internalPubkey: Buffer.from(tapInternalPubkey),
    scriptTree,
    redeem: {
      output: refundScript,
      redeemVersion: TAPSCRIPT_LEAF_VERSION,
    },
  });
  const refundControlBlock =
    refundPayment.witness?.[refundPayment.witness.length - 1];
  if (!hash || !output || !hashlockControlBlock || !refundControlBlock) {
    throw new Error('Failed to derive the expected Pre-PegIn HTLC output.');
  }

  return {
    hashlockScript,
    hashlockControlBlock,
    refundScript,
    refundControlBlock,
    scriptPubKey: output,
    tapMerkleRoot: hash,
  };
}
