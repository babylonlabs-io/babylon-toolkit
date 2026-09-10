import * as ecc from '@bitcoin-js/tiny-secp256k1-asmjs';
import {
  initEccLib,
  script as bscript,
  opcodes,
  payments,
} from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { tapInternalPubkey } from './constants.js';
import type { HtlcConnectorParams } from './types.js';

import {
  MAX_U16,
  TAPSCRIPT_LEAF_VERSION,
  normalizeXOnlyKey,
  normalizeKeyGroup,
  nOfNChunks,
  stripHexPrefix,
} from './connectorScripts.js';

const PREIMAGE_LENGTH_BYTES = 32;

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

/**
 * Derive the canonical Pre-PegIn HTLC without using vault WASM output.
 */
export function deriveExpectedPrePeginHtlc(
  params: PrePeginHtlcParams,
  hashlock: string,
): ExpectedPrePeginHtlc {
  initEccLib(ecc);

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
