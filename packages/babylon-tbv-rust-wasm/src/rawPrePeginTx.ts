import { RawOldTx } from '@scure/btc-signer/script';
import { Buffer } from 'buffer';
import { GuardedPeginTx } from './rawPeginTx.js';
import { MAX_U16 } from './connectorScripts.js';
import type * as Bindings from '../dist/generated/vault_wasm.js';
// @ts-expect-error - generated artifacts live in dist/generated
import { WasmPrePeginTx as RawTransaction } from './generated/vault_wasm.js';
import {
  assertFundedPrePegin,
  assertU64,
  deriveExpectedPrePegin,
  depositorScript,
  htlcAddress,
  type ExpectedPrePegin,
} from './prePeginTransaction.js';

export type PrePeginTxArgs = [
  txGraphVersion: number,
  depositor: string,
  provider: string,
  keepers: string[],
  challengers: string[],
  hashlocks: string[],
  peginAmounts: readonly bigint[],
  timelockRefund: number,
  feeRate: bigint,
  minPeginFeeRate: bigint,
  numLocalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  network: string,
  authAnchorHash?: string | null,
];

/** Check original amounts, funded reconstruction, and unsigned refunds. */
export class GuardedPrePeginTx {
  #inner: Bindings.WasmPrePeginTx;
  readonly #expected: ExpectedPrePegin;
  #txHex: string;
  #txid: string;
  #funded = false;

  constructor(...args: PrePeginTxArgs) {
    const [
      txGraphVersion,
      depositorPubkey,
      vaultProviderPubkey,
      vaultKeeperPubkeys,
      universalChallengerPubkeys,
      hashlocks,
      pegInAmounts,
      timelockRefund,
      feeRate,
      minPeginFeeRate,
      numLocalChallengers,
      councilQuorum,
      councilSize,
      network,
      authAnchorHash,
    ] = args;
    this.#expected = deriveExpectedPrePegin({
      txGraphVersion,
      depositorPubkey,
      vaultProviderPubkey,
      vaultKeeperPubkeys,
      universalChallengerPubkeys,
      hashlocks,
      pegInAmounts,
      timelockRefund,
      feeRate,
      minPeginFeeRate,
      numLocalChallengers,
      councilQuorum,
      councilSize,
      network,
      authAnchorHash,
    });
    this.#txHex = this.#expected.txHex;
    this.#txid = this.#expected.txid;
    const p = this.#expected.params;
    this.#inner = new RawTransaction(
      p.txGraphVersion,
      p.depositorPubkey,
      p.vaultProviderPubkey,
      [...p.vaultKeeperPubkeys],
      [...p.universalChallengerPubkeys],
      [...p.hashlocks],
      new BigUint64Array(p.pegInAmounts),
      p.timelockRefund,
      p.feeRate,
      p.minPeginFeeRate,
      p.numLocalChallengers,
      p.councilQuorum,
      p.councilSize,
      p.network,
      p.authAnchorHash,
    );
    try {
      this.#checkAll();
    } catch (error) {
      this.#inner.free();
      throw error;
    }
  }

  #args(): PrePeginTxArgs {
    const p = this.#expected.params;
    return [
      p.txGraphVersion,
      p.depositorPubkey,
      p.vaultProviderPubkey,
      [...p.vaultKeeperPubkeys],
      [...p.universalChallengerPubkeys],
      [...p.hashlocks],
      [...p.pegInAmounts],
      p.timelockRefund,
      p.feeRate,
      p.minPeginFeeRate,
      p.numLocalChallengers,
      p.councilQuorum,
      p.councilSize,
      p.network,
      p.authAnchorHash,
    ];
  }

  #check<T extends string | number | bigint>(
    actual: T,
    expected: T,
    field: string,
  ): T {
    if (actual !== expected)
      throw new Error(
        `WASM Pre-PegIn ${field} does not match the original request.`,
      );
    return actual;
  }

  #index(index: number): number {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index > 255 ||
      index >= this.#expected.htlcValues.length
    ) {
      throw new Error('htlcVout must select an existing HTLC and fit in u8.');
    }
    return index;
  }

  #checkAll(): void {
    this.toHex();
    this.getTxid();
    this.getTxGraphVersion();
    this.getNumHtlcs();
    this.getDepositorClaimValue();
    // The Rust indexed getters accept u8. The full encoding check covers every output.
    for (
      let i = 0;
      i < Math.min(this.#expected.htlcValues.length, 256);
      i += 1
    ) {
      this.getHtlcValue(i);
      this.getPeginAmountAt(i);
      this.getHtlcScriptPubKey(i);
      this.getHtlcAddress(i);
    }
  }

  fromFundedTransaction(txHex: string): GuardedPrePeginTx {
    this.toHex();
    const funded = assertFundedPrePegin(txHex, this.#expected);
    const copy = new GuardedPrePeginTx(...this.#args());
    try {
      const unfunded = copy.#inner;
      copy.#inner = unfunded.fromFundedTransaction(funded.txHex);
      unfunded.free();
      copy.#txHex = funded.txHex;
      copy.#txid = funded.txid;
      copy.#funded = true;
      copy.#checkAll();
      return copy;
    } catch (error) {
      copy.free();
      throw error;
    }
  }

  buildPeginTx(timelockPegin: number, htlcVout: number): GuardedPeginTx {
    if (
      !Number.isInteger(timelockPegin) ||
      timelockPegin < 1 ||
      timelockPegin > MAX_U16
    ) {
      throw new Error('timelockPegin must be an integer from 1 to 65535.');
    }
    this.toHex();
    const index = this.#index(htlcVout);
    if (!this.#funded)
      throw new Error('Pre-PegIn must be funded before building a PegIn.');
    return GuardedPeginTx.fromBuiltTransaction(
      this.#inner.buildPeginTx(timelockPegin, index),
      {
        prePeginParams: this.#expected.params,
        fundedPrePeginTxHex: this.#txHex,
        htlcVout: index,
        timelockPegin,
      },
    );
  }

  buildRefundTx(refundFee: bigint, htlcVout: number): string {
    this.toHex();
    const index = this.#index(htlcVout);
    assertU64(refundFee, 'refundFee');
    if (!this.#funded)
      throw new Error('Pre-PegIn must be funded before building a refund.');
    const value = this.#expected.htlcValues[index] - refundFee;
    if (value < 0n) throw new Error('refundFee exceeds the HTLC value.');
    const expected = RawOldTx.encode({
      version: 2,
      lockTime: 0,
      inputs: [
        {
          txid: Buffer.from(this.#txid, 'hex'),
          index,
          finalScriptSig: new Uint8Array(),
          sequence: this.#expected.params.timelockRefund,
        },
      ],
      outputs: [
        {
          amount: value,
          script: depositorScript(this.#expected.params.depositorPubkey),
        },
      ],
    });
    return this.#check(
      this.#inner.buildRefundTx(refundFee, index),
      Buffer.from(expected).toString('hex'),
      'refund transaction',
    );
  }

  toHex(): string {
    return this.#check(this.#inner.toHex(), this.#txHex, 'transaction');
  }
  getTxid(): string {
    return this.#check(this.#inner.getTxid(), this.#txid, 'transaction ID');
  }
  getTxGraphVersion(): number {
    return this.#check(
      this.#inner.getTxGraphVersion(),
      this.#expected.params.txGraphVersion,
      'graph version',
    );
  }
  getNumHtlcs(): number {
    return this.#check(
      this.#inner.getNumHtlcs(),
      this.#expected.htlcValues.length,
      'HTLC count',
    );
  }
  getDepositorClaimValue(): bigint {
    return this.#check(
      this.#inner.getDepositorClaimValue(),
      this.#expected.depositorClaimValue,
      'claim value',
    );
  }
  getHtlcValue(htlcVout: number): bigint {
    const index = this.#index(htlcVout);
    return this.#check(
      this.#inner.getHtlcValue(index),
      this.#expected.htlcValues[index],
      'HTLC value',
    );
  }
  getPeginAmountAt(htlcVout: number): bigint {
    const index = this.#index(htlcVout);
    return this.#check(
      this.#inner.getPeginAmountAt(index),
      this.#expected.params.pegInAmounts[index],
      'deposit amount',
    );
  }
  getHtlcScriptPubKey(htlcVout: number): string {
    const index = this.#index(htlcVout);
    return this.#check(
      this.#inner.getHtlcScriptPubKey(index),
      Buffer.from(this.#expected.outputs[index].script).toString('hex'),
      'HTLC script',
    );
  }
  getHtlcAddress(htlcVout: number): string {
    const index = this.#index(htlcVout);
    return this.#check(
      this.#inner.getHtlcAddress(index),
      htlcAddress(this.#expected, index),
      'HTLC address',
    );
  }
  free(): void {
    this.#inner.free();
  }
  [Symbol.dispose](): void {
    this.free();
  }
}
