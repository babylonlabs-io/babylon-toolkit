import { schnorr } from '@noble/curves/secp256k1.js';
import { RawOldTx } from '@scure/btc-signer/script';
import { Transaction } from '@scure/btc-signer';
import { crypto, payments, script, opcodes } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { parse, parseNumberAndBigInt } from 'lossless-json';
import type * as Bindings from '../dist/generated/vault_wasm.js';
// @ts-expect-error - generated artifacts live in dist/generated
import { WasmPeginTx as RawTransaction } from './generated/vault_wasm.js';
import { normalizeKeyGroup, normalizeXOnlyKey } from './connectorScripts.js';
import { tapInternalPubkey } from './constants.js';
import { deriveExpectedPeginPayout } from './peginPayout.js';
import { deriveExpectedPrePeginHtlc } from './prePeginHtlc.js';
import {
  assertFundedPrePegin,
  decodeTransaction,
  deriveExpectedPrePegin,
  transactionId,
  type BitcoinTransaction,
  type PrePeginTransactionParams,
} from './prePeginTransaction.js';

/** Supply the original request and funded parent from a trusted source. */
export interface PeginRestoreParams {
  prePeginParams: PrePeginTransactionParams;
  fundedPrePeginTxHex: string;
  htlcVout: number;
  timelockPegin: number;
}

function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error('PegIn JSON must contain plain objects.');
  }
  return value as Record<string, unknown>;
}

function exact(actual: unknown, expected: unknown): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(
        'PegIn JSON array does not match the trusted transaction.',
      );
    }
    expected.forEach((value, index) => exact(actual[index], value));
  } else if (expected !== null && typeof expected === 'object') {
    const object = record(actual);
    exact(Object.keys(object).sort(), Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected))
      exact(object[key], value);
  } else if (actual !== expected) {
    throw new Error('PegIn JSON does not match the trusted transaction.');
  }
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/** Validate saved metadata, signatures, and bytes against the original request. */
export class GuardedPeginTx {
  readonly #inner: Bindings.WasmPeginTx;
  readonly #version: number;
  readonly #transaction: BitcoinTransaction;
  readonly #unsignedHex: string;
  readonly #txid: string;
  readonly #htlc: ReturnType<typeof deriveExpectedPrePeginHtlc>;
  readonly #prevout: { value: bigint; script_pubkey: string };
  readonly #payout: Record<string, unknown>;
  readonly #inputConnector: Record<string, unknown>;
  readonly #signatureKeys: string[];
  readonly #sighashes: Map<number, Uint8Array>;

  private constructor(
    inner: Bindings.WasmPeginTx,
    trusted: PeginRestoreParams,
    serialized?: string,
  ) {
    this.#inner = inner;
    try {
      const expected = deriveExpectedPrePegin(trusted.prePeginParams);
      const p = expected.params;
      const index = trusted.htlcVout;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > 255 ||
        index >= p.pegInAmounts.length
      ) {
        throw new Error('htlcVout must select an existing HTLC and fit in u8.');
      }
      const funded = assertFundedPrePegin(
        trusted.fundedPrePeginTxHex,
        expected,
      );
      this.#version = p.txGraphVersion;
      const depositor = normalizeXOnlyKey(p.depositorPubkey, 'depositorPubkey');
      const provider = normalizeXOnlyKey(
        p.vaultProviderPubkey,
        'vaultProviderPubkey',
      );
      const keepers = normalizeKeyGroup(
        p.vaultKeeperPubkeys,
        'vaultKeeperPubkeys',
      );
      const challengers = normalizeKeyGroup(
        p.universalChallengerPubkeys,
        'universalChallengerPubkeys',
      );
      const payout = deriveExpectedPeginPayout({
        txGraphVersion: this.#version,
        depositor,
        vaultProvider: provider,
        vaultKeepers: keepers,
        universalChallengers: challengers,
        timelockPegin: trusted.timelockPegin,
      });
      // SingleKeyConnector uses a script leaf. The refund uses BIP-86.
      const claim = payments.p2tr({
        internalPubkey: Buffer.from(tapInternalPubkey),
        scriptTree: {
          output: script.compile([
            Buffer.from(depositor, 'hex'),
            opcodes.OP_CHECKSIG,
          ]),
          version: 0xc0,
        },
      }).output;
      if (!claim)
        throw new Error('Failed to derive the depositor claim output.');
      const roles = {
        depositor,
        vault_provider: provider,
        vault_keepers: keepers,
        universal_challengers: challengers,
      };
      this.#payout = {
        ...roles,
        timelock_pegin: BigInt(trusted.timelockPegin),
      };
      const hashlock = p.hashlocks[index].replace(/^0x/i, '').toLowerCase();
      this.#inputConnector = {
        ...roles,
        hashlock,
        timelock_refund: BigInt(p.timelockRefund),
      };
      this.#htlc = deriveExpectedPrePeginHtlc(p, hashlock);
      this.#prevout = {
        value: expected.htlcValues[index],
        script_pubkey: hex(this.#htlc.scriptPubKey),
      };
      if (p.pegInAmounts[index] < 330n || expected.depositorClaimValue < 330n) {
        throw new Error('PegIn outputs must meet the 330-sat dust threshold.');
      }
      this.#transaction = {
        version: this.#version === 1 ? 2 : 3,
        lockTime: 0,
        inputs: [
          {
            txid: Buffer.from(funded.txid, 'hex'),
            index,
            sequence: 0xfffffffe,
            finalScriptSig: new Uint8Array(),
          },
        ],
        outputs: [
          { amount: p.pegInAmounts[index], script: payout.scriptPubKey },
          { amount: expected.depositorClaimValue, script: claim },
          ...(this.#version === 1
            ? []
            : [{ amount: 240n, script: Buffer.from('51024e73', 'hex') }]),
        ],
      };
      this.#unsignedHex = hex(RawOldTx.encode(this.#transaction));
      this.#txid = transactionId(this.#transaction);
      this.#signatureKeys = [...challengers]
        .reverse()
        .concat([...keepers].reverse(), provider, depositor);
      const transaction = Transaction.fromRaw(
        Buffer.from(this.#unsignedHex, 'hex'),
        { allowUnknownInputs: true, allowUnknownOutputs: true },
      );
      this.#sighashes = new Map(
        [0, 1].map((hashType) => [
          hashType,
          transaction.preimageWitnessV1(
            0,
            [this.#htlc.scriptPubKey],
            hashType,
            [this.#prevout.value],
            undefined,
            this.#htlc.hashlockScript,
          ),
        ]),
      );
      const checked = this.#checkAll();
      if (serialized !== undefined)
        this.#checkJson(serialized, checked.transaction);
    } catch (error) {
      inner.free();
      throw error;
    }
  }

  static fromJson(
    version: number,
    json: string,
    trusted: PeginRestoreParams,
  ): GuardedPeginTx {
    if (!trusted || version !== trusted.prePeginParams?.txGraphVersion) {
      throw new Error(
        'PegIn graph version must match the trusted restore inputs.',
      );
    }
    return new GuardedPeginTx(
      RawTransaction.fromJson(version, json),
      trusted,
      json,
    );
  }

  /** Check a newly built transaction before it leaves the raw entry. */
  static fromBuiltTransaction(
    inner: Bindings.WasmPeginTx,
    trusted: PeginRestoreParams,
  ): GuardedPeginTx {
    return new GuardedPeginTx(inner, trusted);
  }

  #signature(value: unknown, pubkey: string): string | undefined {
    if (value === null) return undefined;
    const signature = record(value);
    exact(Object.keys(signature).sort(), ['sighash_type', 'signature']);
    if (
      typeof signature.signature !== 'string' ||
      !/^[0-9a-f]{128}$/.test(signature.signature)
    ) {
      throw new Error('PegIn stored signature must contain 64 bytes.');
    }
    const suffix =
      signature.sighash_type === 'SIGHASH_DEFAULT'
        ? ''
        : signature.sighash_type === 'SIGHASH_ALL'
          ? '01'
          : undefined;
    if (suffix === undefined)
      throw new Error(
        'PegIn signature requires SIGHASH_DEFAULT or SIGHASH_ALL.',
      );
    const encoded = signature.signature + suffix;
    this.#verifySignature(Buffer.from(encoded, 'hex'), pubkey);
    return encoded;
  }

  #verifySignature(signature: Uint8Array, pubkey: string): void {
    const hashType =
      signature.length === 64
        ? 0
        : signature.length === 65 && signature[64] === 1
          ? 1
          : -1;
    const digest = this.#sighashes.get(hashType);
    if (!digest || !schnorr.verify(signature.subarray(0, 64), digest, pubkey)) {
      throw new Error(
        'PegIn signature does not match the trusted transaction and signer.',
      );
    }
  }

  #checkJson(json: string, transaction: BitcoinTransaction): void {
    const data = record(parse(json, undefined, parseNumberAndBigInt));
    const spender = record(data.pegin_input_spender);
    const depositor = this.#payout.depositor as string;
    const provider = this.#payout.vault_provider as string;
    const stored = [
      this.#signature(spender.vault_provider_sig, provider),
      this.#signature(spender.depositor_sig, depositor),
    ];
    for (const [field, keys] of [
      ['vault_keeper_sigs', this.#payout.vault_keepers],
      ['universal_challenger_sigs', this.#payout.universal_challengers],
    ] as const) {
      const signatures = record(spender[field]);
      for (const [pubkey, signature] of Object.entries(signatures)) {
        if (!(keys as string[]).includes(pubkey) || signature === null) {
          throw new Error(
            'PegIn signature map contains an unknown signer or empty signature.',
          );
        }
      }
      stored.unshift(
        ...[...(keys as string[])]
          .reverse()
          .map((pubkey) =>
            Object.hasOwn(signatures, pubkey)
              ? this.#signature(signatures[pubkey], pubkey)
              : undefined,
          ),
      );
    }
    const witness = transaction.witnesses?.[0] ?? [];
    const input = transaction.inputs[0];
    exact(data, {
      tx: {
        version: BigInt(transaction.version),
        lock_time: BigInt(transaction.lockTime),
        input: [
          {
            previous_output: `${hex(input.txid)}:${input.index}`,
            script_sig: '',
            sequence: BigInt(input.sequence),
            witness: witness.map(hex),
          },
        ],
        output: transaction.outputs.map((output) => ({
          value: output.amount,
          script_pubkey: hex(output.script),
        })),
      },
      pegin_payout_connector: this.#payout,
      depositor_claim_connector: { pubkey: depositor },
      pegin_input_spender: {
        htlc_connector: this.#inputConnector,
        depositor_sig: spender.depositor_sig,
        vault_provider_sig: spender.vault_provider_sig,
        vault_keeper_sigs: spender.vault_keeper_sigs,
        universal_challenger_sigs: spender.universal_challenger_sigs,
      },
      ...(Object.hasOwn(data, 'prepegin_htlc_prevout')
        ? {
            prepegin_htlc_prevout:
              data.prepegin_htlc_prevout === null ? null : this.#prevout,
          }
        : {}),
    });
    if (witness.length === 0) return;
    const partial = witness.length === 3;
    if (!partial && witness.length !== this.#signatureKeys.length + 3) {
      throw new Error('PegIn witness has an unexpected number of items.');
    }
    exact(witness.slice(-2).map(hex), [
      hex(this.#htlc.hashlockScript),
      hex(this.#htlc.hashlockControlBlock),
    ]);
    const keys = partial ? [depositor] : this.#signatureKeys;
    keys.forEach((pubkey, index) => {
      this.#verifySignature(witness[index], pubkey);
      const saved = partial ? stored.at(-1) : stored[index];
      if (saved !== undefined) exact(hex(witness[index]), saved);
    });
    if (!partial) {
      const preimage = witness[witness.length - 3];
      if (
        preimage.length !== 32 ||
        hex(crypto.sha256(Buffer.from(preimage))) !==
          this.#inputConnector.hashlock
      ) {
        throw new Error(
          'PegIn witness preimage does not match the trusted hashlock.',
        );
      }
    }
  }

  #checkAll() {
    const txHex = this.#inner.toHex();
    const transaction = decodeTransaction(txHex);
    exact(hex(RawOldTx.encode(transaction)), this.#unsignedHex);
    exact(this.#inner.getTxGraphVersion(), this.#version);
    exact(this.#inner.getTxid(), this.#txid);
    exact(
      this.#inner.getVaultScriptPubKey(),
      hex(this.#transaction.outputs[0].script),
    );
    exact(this.#inner.getVaultValue(), this.#transaction.outputs[0].amount);
    const json = this.#inner.toJson();
    this.#checkJson(json, transaction);
    return { txHex, json, transaction };
  }

  toHex(): string {
    return this.#checkAll().txHex;
  }
  toJson(): string {
    return this.#checkAll().json;
  }
  getTxid(): string {
    this.#checkAll();
    return this.#txid;
  }
  getTxGraphVersion(): number {
    this.#checkAll();
    return this.#version;
  }
  getVaultScriptPubKey(): string {
    this.#checkAll();
    return hex(this.#transaction.outputs[0].script);
  }
  getVaultValue(): bigint {
    this.#checkAll();
    return this.#transaction.outputs[0].amount;
  }
  free(): void {
    this.#inner.free();
  }
  [Symbol.dispose](): void {
    this.free();
  }
}
