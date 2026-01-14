/* tslint:disable */
/* eslint-disable */

export class WasmPeginPayoutConnector {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the taproot address for this connector
   */
  getAddress(network: string): string;
  /**
   * Get the payout script (tap leaf script)
   */
  getPayoutScript(): string;
  /**
   * Get the script pubkey for this connector
   */
  getScriptPubKey(network: string): string;
  /**
   * Get the taproot script hash (for sighash computation)
   */
  getTaprootScriptHash(): string;
  /**
   * Create a new PeginPayoutConnector
   *
   * # Arguments
   * * `depositor` - Depositor's x-only public key (64 hex chars)
   * * `vault_provider` - Vault provider's x-only public key (64 hex chars)
   * * `vault_keepers` - Array of vault keeper x-only public keys
   * * `universal_challengers` - Array of universal challenger x-only public keys
   */
  constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[]);
}

export class WasmPeginTx {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the vault output's value in satoshis
   */
  getVaultValue(): bigint;
  /**
   * Get the vault output's script pubkey
   */
  getVaultScriptPubKey(): string;
  /**
   * Create a new unfunded PegIn transaction
   *
   * # Arguments
   * * `depositor_pubkey` - Depositor's x-only public key (64 hex chars)
   * * `vault_provider_pubkey` - Vault provider's x-only public key (64 hex chars)
   * * `vault_keeper_pubkeys` - Array of vault keeper x-only public keys
   * * `universal_challenger_pubkeys` - Array of universal challenger x-only public keys
   * * `pegin_amount` - Amount in satoshis
   * * `network` - Network ("mainnet", "testnet", "regtest", "signet")
   */
  constructor(depositor_pubkey: string, vault_provider_pubkey: string, vault_keeper_pubkeys: string[], universal_challenger_pubkeys: string[], pegin_amount: bigint, network: string);
  /**
   * Get the transaction as hex
   */
  toHex(): string;
  /**
   * Get the transaction ID
   */
  getTxid(): string;
}

export function init_panic_hook(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmpeginpayoutconnector_free: (a: number, b: number) => void;
  readonly __wbg_wasmpegintx_free: (a: number, b: number) => void;
  readonly init_panic_hook: () => void;
  readonly wasmpeginpayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getPayoutScript: (a: number) => [number, number];
  readonly wasmpeginpayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getTaprootScriptHash: (a: number) => [number, number];
  readonly wasmpeginpayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly wasmpegintx_getTxid: (a: number) => [number, number];
  readonly wasmpegintx_getVaultScriptPubKey: (a: number) => [number, number];
  readonly wasmpegintx_getVaultValue: (a: number) => bigint;
  readonly wasmpegintx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: number, k: number) => [number, number, number];
  readonly wasmpegintx_toHex: (a: number) => [number, number];
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_alloc: () => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
