/* tslint:disable */
/* eslint-disable */

export class WasmPayoutOptimisticTx {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Creates a new PayoutOptimistic transaction.
   *
   * # Arguments
   *
   * * `pegin_tx_json` - JSON string of the PegInTx
   * * `claim_tx_json` - JSON string of the ClaimTx
   * * `timelock_challenge` - Challenge period timelock (t3)
   * * `payout_receiver` - Hex-encoded public key of the payout receiver
   * * `fee` - Transaction fee in satoshis
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  constructor(pegin_tx_json: string, claim_tx_json: string, timelock_challenge: number, payout_receiver: string, fee: bigint, network: string);
  /**
   * Returns the transaction as hex-encoded bytes.
   */
  toHex(): string;
  /**
   * Returns the transaction ID.
   */
  getTxid(): string;
  /**
   * Returns the serialized PayoutOptimisticTx as JSON.
   */
  toJson(): string;
  /**
   * Creates a WasmPayoutOptimisticTx from a JSON string.
   */
  static fromJson(json: string): WasmPayoutOptimisticTx;
  /**
   * Estimates the virtual size of a PayoutOptimistic transaction.
   *
   * # Arguments
   *
   * * `num_vault_keepers` - Number of vault keepers
   * * `num_universal_challengers` - Number of universal challengers
   * * `num_local_challengers` - Number of local challengers
   */
  static estimateVsize(num_vault_keepers: number, num_universal_challengers: number, num_local_challengers: number): bigint;
}

export class WasmPayoutTx {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Creates a new Payout transaction.
   *
   * # Arguments
   *
   * * `pegin_tx_json` - JSON string of the PegInTx
   * * `assert_tx_json` - JSON string of the AssertTx
   * * `payout_receiver` - Hex-encoded public key of the payout receiver
   * * `fee` - Transaction fee in satoshis
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  constructor(pegin_tx_json: string, assert_tx_json: string, payout_receiver: string, fee: bigint, network: string);
  /**
   * Returns the transaction as hex-encoded bytes.
   */
  toHex(): string;
  /**
   * Returns the transaction ID.
   */
  getTxid(): string;
  /**
   * Returns the serialized PayoutTx as JSON.
   */
  toJson(): string;
  /**
   * Creates a WasmPayoutTx from a JSON string.
   */
  static fromJson(json: string): WasmPayoutTx;
  /**
   * Estimates the virtual size of a Payout transaction.
   *
   * # Arguments
   *
   * * `num_vault_keepers` - Number of vault keepers
   * * `num_universal_challengers` - Number of universal challengers
   * * `num_local_challengers` - Number of local challengers
   * * `council_size` - Number of council members
   */
  static estimateVsize(num_vault_keepers: number, num_universal_challengers: number, num_local_challengers: number, council_size: number): bigint;
}

export class WasmPeginPayoutConnector {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Creates a new PeginPayoutConnector.
   *
   * # Arguments
   *
   * * `depositor` - Hex-encoded depositor public key (64 chars)
   * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
   * * `vault_keepers` - Array of hex-encoded vault keeper public keys
   * * `universal_challengers` - Array of hex-encoded universal challenger public keys
   */
  constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[]);
  /**
   * Returns the Taproot address for the connector.
   *
   * # Arguments
   *
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  getAddress(network: string): string;
  /**
   * Returns the Taproot scriptPubKey as hex.
   *
   * # Arguments
   *
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  getScriptPubKey(network: string): string;
  /**
   * Returns the payout script as hex.
   */
  getPayoutScript(): string;
  /**
   * Returns the taproot script hash.
   */
  getTaprootScriptHash(): string;
}

export class WasmPeginTx {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Creates a new unfunded PegIn transaction.
   *
   * # Arguments
   *
   * * `depositor` - Hex-encoded depositor public key (64 chars)
   * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
   * * `vault_keepers` - Array of hex-encoded vault keeper public keys
   * * `universal_challengers` - Array of hex-encoded universal challenger public keys
   * * `pegin_amount` - Amount in satoshis to lock in the vault
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], pegin_amount: bigint, network: string);
  /**
   * Returns the transaction as hex-encoded bytes.
   */
  toHex(): string;
  /**
   * Returns the transaction ID.
   */
  getTxid(): string;
  /**
   * Returns the vault scriptPubKey as hex.
   */
  getVaultScriptPubKey(): string;
  /**
   * Returns the vault output value in satoshis.
   */
  getVaultValue(): bigint;
  /**
   * Returns the serialized PegInTx as JSON.
   */
  toJson(): string;
  /**
   * Creates a WasmPeginTx from a JSON string.
   */
  static fromJson(json: string): WasmPeginTx;
}

/**
 * Initialize panic hook for better error messages in the browser console.
 */
export function init_panic_hook(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmpeginpayoutconnector_free: (a: number, b: number) => void;
  readonly wasmpeginpayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly wasmpeginpayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getPayoutScript: (a: number) => [number, number];
  readonly wasmpeginpayoutconnector_getTaprootScriptHash: (a: number) => [number, number];
  readonly __wbg_wasmpegintx_free: (a: number, b: number) => void;
  readonly wasmpegintx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: number, k: number) => [number, number, number];
  readonly wasmpegintx_toHex: (a: number) => [number, number];
  readonly wasmpegintx_getTxid: (a: number) => [number, number];
  readonly wasmpegintx_getVaultScriptPubKey: (a: number) => [number, number];
  readonly wasmpegintx_getVaultValue: (a: number) => bigint;
  readonly wasmpegintx_toJson: (a: number) => [number, number, number, number];
  readonly wasmpegintx_fromJson: (a: number, b: number) => [number, number, number];
  readonly __wbg_wasmpayouttx_free: (a: number, b: number) => void;
  readonly wasmpayouttx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => [number, number, number];
  readonly wasmpayouttx_toHex: (a: number) => [number, number];
  readonly wasmpayouttx_getTxid: (a: number) => [number, number];
  readonly wasmpayouttx_toJson: (a: number) => [number, number, number, number];
  readonly wasmpayouttx_fromJson: (a: number, b: number) => [number, number, number];
  readonly wasmpayouttx_estimateVsize: (a: number, b: number, c: number, d: number) => bigint;
  readonly __wbg_wasmpayoutoptimistictx_free: (a: number, b: number) => void;
  readonly wasmpayoutoptimistictx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: number) => [number, number, number];
  readonly wasmpayoutoptimistictx_toHex: (a: number) => [number, number];
  readonly wasmpayoutoptimistictx_getTxid: (a: number) => [number, number];
  readonly wasmpayoutoptimistictx_toJson: (a: number) => [number, number, number, number];
  readonly wasmpayoutoptimistictx_fromJson: (a: number, b: number) => [number, number, number];
  readonly wasmpayoutoptimistictx_estimateVsize: (a: number, b: number, c: number) => bigint;
  readonly init_panic_hook: () => void;
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
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
