import { address, networks } from 'bitcoinjs-lib';
import type * as Bindings from '../dist/generated/vault_wasm.js';
// @ts-expect-error - generated artifacts live in dist/generated
import { WasmPeginPayoutConnector as RawConnector } from './generated/vault_wasm.js';
import { deriveExpectedPeginPayout } from './peginPayout.js';

/** Check every payout field against the constructor inputs. */
export class GuardedPeginPayoutConnector {
  readonly #inner: Bindings.WasmPeginPayoutConnector;
  readonly #expected: ReturnType<typeof deriveExpectedPeginPayout>;
  readonly #version: number;

  constructor(
    ...args: ConstructorParameters<typeof Bindings.WasmPeginPayoutConnector>
  ) {
    const [version, depositor, provider, keepers, challengers, timelock] = args;
    this.#version = version;
    this.#expected = deriveExpectedPeginPayout({
      txGraphVersion: version,
      depositor,
      vaultProvider: provider,
      vaultKeepers: keepers,
      universalChallengers: challengers,
      timelockPegin: timelock,
    });
    this.#inner = new RawConnector(...args);
    try {
      this.getTxGraphVersion();
      this.getPayoutScript();
      this.getPayoutControlBlock();
      this.getTaprootScriptHash();
      this.getScriptPubKey('bitcoin');
    } catch (error) {
      this.#inner.free();
      throw error;
    }
  }

  #check(value: string, expected: string, field: string): string {
    if (value !== expected) {
      throw new Error(
        `WASM payout ${field} does not match the constructor inputs.`,
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

  getPayoutScript(): string {
    return this.#check(
      this.#inner.getPayoutScript(),
      this.#expected.payoutScript.toString('hex'),
      'script',
    );
  }

  getPayoutControlBlock(): string {
    return this.#check(
      this.#inner.getPayoutControlBlock(),
      this.#expected.payoutControlBlock.toString('hex'),
      'control block',
    );
  }

  getTaprootScriptHash(): string {
    return this.#check(
      this.#inner.getTaprootScriptHash(),
      this.#expected.taprootScriptHash.toString('hex'),
      'script hash',
    );
  }

  getTxGraphVersion(): number {
    const version = this.#inner.getTxGraphVersion();
    if (version !== this.#version) {
      throw new Error(
        'WASM payout version does not match the constructor input.',
      );
    }
    return version;
  }

  free(): void {
    this.#inner.free();
  }

  [Symbol.dispose](): void {
    this.free();
  }
}
