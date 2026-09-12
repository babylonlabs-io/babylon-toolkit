import { address, networks } from 'bitcoinjs-lib';
import type * as Bindings from '../dist/generated/vault_wasm.js';
// @ts-expect-error - generated artifacts live in dist/generated
import { WasmPrePeginHtlcConnector as RawConnector } from './generated/vault_wasm.js';
import { deriveExpectedPrePeginHtlc } from './prePeginHtlc.js';

/**
 * The graph versions the TypeScript derivation is differentially tested
 * against in tests/wasm-loader.test.mjs. The engine may support more; this
 * guard covers only what the tests pin, and rejects the rest.
 */
export const SUPPORTED_HTLC_GRAPH_VERSIONS = [1, 2, 3] as const;

/** Check each HTLC field against the constructor inputs. */
export class GuardedPrePeginHtlcConnector {
  readonly #inner: Bindings.WasmPrePeginHtlcConnector;
  readonly #expected: ReturnType<typeof deriveExpectedPrePeginHtlc>;
  readonly #version: number;
  #freed = false;

  constructor(
    ...args: ConstructorParameters<typeof Bindings.WasmPrePeginHtlcConnector>
  ) {
    const [
      version,
      depositor,
      provider,
      keepers,
      challengers,
      hashlock,
      timelock,
    ] = args;
    if (
      !(SUPPORTED_HTLC_GRAPH_VERSIONS as readonly number[]).includes(version)
    ) {
      throw new Error(`Unsupported HTLC graph version: ${version}.`);
    }
    this.#version = version;
    this.#expected = deriveExpectedPrePeginHtlc(
      {
        depositorPubkey: depositor,
        vaultProviderPubkey: provider,
        vaultKeeperPubkeys: keepers,
        universalChallengerPubkeys: challengers,
        timelockRefund: timelock,
      },
      hashlock,
    );
    this.#inner = new RawConnector(...args);
    try {
      this.getTxGraphVersion();
      this.getHashlockScript();
      this.getHashlockControlBlock();
      this.getRefundScript();
      this.getRefundControlBlock();
      this.getScriptPubKey('bitcoin');
    } catch (error) {
      try {
        this.#inner.free();
      } catch {
        // A release failure must not mask the guard error, which is the one
        // diagnostic that says the engine disagreed with its own inputs.
      }
      throw error;
    }
  }

  #check(value: string, expected: string, field: string): string {
    if (value !== expected) {
      throw new Error(
        `WASM HTLC ${field} does not match the constructor inputs.`,
      );
    }
    return value;
  }

  #network(network: string) {
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

  getAddress(network: string): string {
    const expectedNetwork = this.#network(network);
    return this.#check(
      this.#inner.getAddress(network),
      address.fromOutputScript(this.#expected.scriptPubKey, expectedNetwork),
      'address',
    );
  }

  getScriptPubKey(network: string): string {
    this.#network(network);
    return this.#check(
      this.#inner.getScriptPubKey(network),
      this.#expected.scriptPubKey.toString('hex'),
      'scriptPubKey',
    );
  }

  getHashlockScript(): string {
    return this.#check(
      this.#inner.getHashlockScript(),
      this.#expected.hashlockScript.toString('hex'),
      'hashlock script',
    );
  }

  getHashlockControlBlock(): string {
    return this.#check(
      this.#inner.getHashlockControlBlock(),
      this.#expected.hashlockControlBlock.toString('hex'),
      'hashlock control block',
    );
  }

  getRefundScript(): string {
    return this.#check(
      this.#inner.getRefundScript(),
      this.#expected.refundScript.toString('hex'),
      'refund script',
    );
  }

  getRefundControlBlock(): string {
    return this.#check(
      this.#inner.getRefundControlBlock(),
      this.#expected.refundControlBlock.toString('hex'),
      'refund control block',
    );
  }

  getTxGraphVersion(): number {
    const version = this.#inner.getTxGraphVersion();
    if (version !== this.#version) {
      throw new Error(
        'WASM HTLC version does not match the constructor input.',
      );
    }
    return version;
  }

  free(): void {
    // wasm-bindgen zeroes its pointer without guarding a second call, so a
    // free() then [Symbol.dispose]() would free the null pointer.
    if (this.#freed) {
      return;
    }
    this.#freed = true;
    this.#inner.free();
  }

  [Symbol.dispose](): void {
    this.free();
  }
}
