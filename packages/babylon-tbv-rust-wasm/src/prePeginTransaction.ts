import { RawOldTx, RawTx } from '@scure/btc-signer/script';
import { address, crypto, networks, payments } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { normalizeXOnlyKey } from './connectorScripts.js';
import { computeMinClaimValue, computeMinHtlcValue } from './peginFees.js';
import { deriveExpectedPrePeginHtlc } from './prePeginHtlc.js';
import type { PrePeginParams } from './types.js';
import { assertPositiveBigintArray } from './value-guards.js';

export type PrePeginTransactionParams = Omit<
  PrePeginParams,
  'network' | 'authAnchorHash'
> & {
  network: string;
  authAnchorHash?: string | null;
};
export type BitcoinTransaction = ReturnType<typeof RawTx.decode>;
export type BitcoinOutput = BitcoinTransaction['outputs'][number];

export interface ExpectedPrePegin {
  params: PrePeginTransactionParams;
  htlcValues: readonly bigint[];
  depositorClaimValue: bigint;
  outputs: readonly BitcoinOutput[];
  txHex: string;
  txid: string;
}

export function bitcoinNetwork(network: string) {
  switch (network) {
    case 'bitcoin':
      return networks.bitcoin;
    case 'testnet':
    case 'testnet4':
    case 'signet':
      return networks.testnet;
    case 'regtest':
      return networks.regtest;
    default:
      throw new Error(`Unsupported Bitcoin network: ${network}.`);
  }
}

export function assertU64(value: bigint, label: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > (1n << 64n) - 1n) {
    throw new Error(`${label} must be a bigint from 0 through u64::MAX.`);
  }
  return value;
}

/** Hash the transaction's canonical serialization without witness data. */
export function transactionId(
  transaction: Parameters<typeof RawOldTx.encode>[0],
): string {
  return crypto
    .hash256(Buffer.from(RawOldTx.encode(transaction)))
    .reverse()
    .toString('hex');
}

/** Decode funded bytes without converting satoshi values to Number. */
export function decodeTransaction(hex: string): BitcoinTransaction {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
    throw new Error('Transaction must be non-empty, even-length hex.');
  }
  const bytes = Buffer.from(hex, 'hex');
  const transaction = RawTx.decode(bytes);
  if (!Buffer.from(RawTx.encode(transaction)).equals(bytes)) {
    throw new Error('Transaction encoding is not canonical.');
  }
  if (
    transaction.segwitFlag &&
    !transaction.witnesses?.some((items) => items.length > 0)
  ) {
    throw new Error('Transaction has a superfluous witness marker.');
  }
  return transaction;
}

/** Derive the depositor's existing BIP-86 destination. */
export function depositorScript(pubkey: string): Buffer {
  const { output } = payments.p2tr({
    internalPubkey: Buffer.from(
      normalizeXOnlyKey(pubkey, 'depositorPubkey'),
      'hex',
    ),
  });
  if (!output) throw new Error('Failed to derive the depositor BIP-86 output.');
  return output;
}

/** Derive and snapshot the original request before any WASM conversion. */
export function deriveExpectedPrePegin(
  input: PrePeginTransactionParams,
): ExpectedPrePegin {
  if (
    input.txGraphVersion !== 1 &&
    input.txGraphVersion !== 2 &&
    input.txGraphVersion !== 3
  ) {
    throw new Error(
      `Unsupported Pre-PegIn graph version: ${input.txGraphVersion}.`,
    );
  }
  bitcoinNetwork(input.network);
  if (!Array.isArray(input.pegInAmounts)) {
    throw new Error('pegInAmounts must be an array of original bigints.');
  }
  for (const field of [
    'hashlocks',
    'vaultKeeperPubkeys',
    'universalChallengerPubkeys',
  ] as const) {
    if (!Array.isArray(input[field]))
      throw new Error(`${field} must be an array.`);
  }
  const params: PrePeginTransactionParams = {
    ...input,
    pegInAmounts: assertPositiveBigintArray(
      [...input.pegInAmounts],
      'pegInAmounts',
    ),
    hashlocks: [...input.hashlocks],
    vaultKeeperPubkeys: [...input.vaultKeeperPubkeys],
    universalChallengerPubkeys: [...input.universalChallengerPubkeys],
  };
  if (params.hashlocks.length !== params.pegInAmounts.length) {
    throw new Error('hashlocks and pegInAmounts must have the same length.');
  }
  const depositorClaimValue = computeMinClaimValue(
    params.txGraphVersion,
    params.numLocalChallengers,
    params.universalChallengerPubkeys.length,
    params.councilQuorum,
    params.councilSize,
    params.feeRate,
  );
  const htlcValues = params.pegInAmounts.map((amount) =>
    computeMinHtlcValue(
      params.txGraphVersion,
      amount,
      depositorClaimValue,
      params.vaultKeeperPubkeys.length,
      params.universalChallengerPubkeys.length,
      params.minPeginFeeRate,
    ),
  );
  const outputs: BitcoinOutput[] = params.hashlocks.map((hashlock, index) => ({
    amount: htlcValues[index],
    script: deriveExpectedPrePeginHtlc(params, hashlock).scriptPubKey,
  }));
  if (outputs.some((output) => output.amount < 330n)) {
    throw new Error(
      'Pre-PegIn HTLC values must meet the 330-sat dust threshold.',
    );
  }
  if (params.authAnchorHash != null) {
    const hash = params.authAnchorHash.replace(/^0x/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error('authAnchorHash must be 32 bytes.');
    }
    params.authAnchorHash = hash.toLowerCase();
    outputs.push({ amount: 0n, script: Buffer.from(`6a20${hash}`, 'hex') });
  }
  outputs.push({
    amount: 546n,
    script: depositorScript(params.depositorPubkey),
  });
  const transaction = { version: 2, lockTime: 0, inputs: [], outputs };
  const withoutWitness = Buffer.from(RawOldTx.encode(transaction));
  // Rust serializes zero-input templates with the SegWit marker and flag.
  const txHex = Buffer.concat([
    withoutWitness.subarray(0, 4),
    Buffer.from([0, 1]),
    withoutWitness.subarray(4),
  ]).toString('hex');
  return {
    params,
    htlcValues,
    depositorClaimValue,
    outputs,
    txHex,
    txid: transactionId(transaction),
  };
}

/** Bind funded protocol outputs to the original request. Preserve wallet change. */
export function assertFundedPrePegin(
  txHex: string,
  expected: ExpectedPrePegin,
): {
  transaction: BitcoinTransaction;
  txHex: string;
  txid: string;
} {
  const transaction = decodeTransaction(txHex);
  if (transaction.version < 2 || transaction.inputs.length === 0) {
    throw new Error(
      'Funded Pre-PegIn requires version >= 2 and at least one input.',
    );
  }
  if (transaction.inputs.some((input) => input.finalScriptSig.length !== 0)) {
    throw new Error('Funded Pre-PegIn inputs must have empty scriptSig.');
  }
  for (const [index, output] of expected.outputs.entries()) {
    const actual = transaction.outputs[index];
    if (
      !actual ||
      actual.amount !== output.amount ||
      !Buffer.from(actual.script).equals(output.script)
    ) {
      throw new Error(
        `Funded Pre-PegIn output ${index} does not match the original request.`,
      );
    }
  }
  return {
    transaction,
    txHex: txHex.toLowerCase(),
    txid: transactionId(transaction),
  };
}

export function htlcAddress(expected: ExpectedPrePegin, index: number): string {
  return address.fromOutputScript(
    Buffer.from(expected.outputs[index].script),
    bitcoinNetwork(expected.params.network),
  );
}
