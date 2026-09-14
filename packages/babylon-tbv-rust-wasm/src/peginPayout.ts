import * as ecc from '@bitcoin-js/tiny-secp256k1-asmjs';
import {
  initEccLib,
  script as bscript,
  opcodes,
  payments,
} from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { tapInternalPubkey } from './constants.js';
import {
  MAX_U16,
  TAPSCRIPT_LEAF_VERSION,
  normalizeXOnlyKey,
  normalizeKeyGroup,
  nOfNChunks,
} from './connectorScripts.js';
import type { PayoutConnectorParams } from './types.js';

export interface ExpectedPeginPayout {
  payoutScript: Buffer;
  payoutControlBlock: Buffer;
  scriptPubKey: Buffer;
  taprootScriptHash: Buffer;
}

/** Derive the payout leaf shared by pinned graph versions 1, 2, and 3. */
export function deriveExpectedPeginPayout(
  params: PayoutConnectorParams,
): ExpectedPeginPayout {
  if (
    params.txGraphVersion !== 1 &&
    params.txGraphVersion !== 2 &&
    params.txGraphVersion !== 3
  ) {
    throw new Error(
      `Unsupported payout graph version: ${params.txGraphVersion}.`,
    );
  }
  if (
    !Number.isInteger(params.timelockPegin) ||
    params.timelockPegin < 1 ||
    params.timelockPegin > MAX_U16
  ) {
    throw new Error('timelockPegin must be an integer from 1 to 65535.');
  }
  initEccLib(ecc);
  const depositor = normalizeXOnlyKey(params.depositor, 'depositor');
  const provider = normalizeXOnlyKey(params.vaultProvider, 'vaultProvider');
  const keepers = normalizeKeyGroup(params.vaultKeepers, 'vaultKeepers');
  const challengers = normalizeKeyGroup(
    params.universalChallengers,
    'universalChallengers',
  );
  // btc-vault crates/vault/src/connectors/pegin_payout.rs at 2c1177ec,
  // 27c0062b, and e1e50f66 uses this single leaf and the fixed internal key.
  const payoutScript = bscript.compile([
    Buffer.from(depositor, 'hex'),
    opcodes.OP_CHECKSIGVERIFY,
    Buffer.from(provider, 'hex'),
    opcodes.OP_CHECKSIGVERIFY,
    ...nOfNChunks(keepers, true),
    ...nOfNChunks(challengers, true),
    bscript.number.encode(params.timelockPegin),
    opcodes.OP_CHECKSEQUENCEVERIFY,
  ]);
  const { hash, output, witness } = payments.p2tr({
    internalPubkey: Buffer.from(tapInternalPubkey),
    scriptTree: { output: payoutScript, version: TAPSCRIPT_LEAF_VERSION },
    redeem: { output: payoutScript, redeemVersion: TAPSCRIPT_LEAF_VERSION },
  });
  const payoutControlBlock = witness?.[witness.length - 1];
  if (!hash || !output || !payoutControlBlock) {
    throw new Error('Failed to derive the expected PegIn payout output.');
  }
  return {
    payoutScript,
    payoutControlBlock,
    scriptPubKey: output,
    taprootScriptHash: hash,
  };
}
