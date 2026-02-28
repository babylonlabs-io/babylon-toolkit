/* tslint:disable */
/* eslint-disable */
/**
 * Initialize panic hook for better error messages in the browser console.
 */
export function init_panic_hook(): void;
/**
 * WASM wrapper for PayoutTx.
 *
 * Represents a Payout transaction that releases funds after a successful
 * challenge resolution (Assert path).
 */
export class WasmPayoutTx {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Estimates the virtual size of a Payout transaction.
   *
   * # Arguments
   *
   * * `num_vault_keepers` - Number of vault keepers
   * * `num_universal_challengers` - Number of universal challengers
   * * `num_local_challengers` - Number of local challengers
   * * `council_size` - Number of council members
   * * `commission_json` - Optional JSON string of the Commission (null/undefined for no commission)
   */
  static estimateVsize(num_vault_keepers: number, num_universal_challengers: number, num_local_challengers: number, council_size: number, commission_json?: string | null): bigint;
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
   * * `commission_json` - Optional JSON string of the Commission (null/undefined for no commission)
   */
  constructor(pegin_tx_json: string, assert_tx_json: string, payout_receiver: string, fee: bigint, network: string, commission_json?: string | null);
  /**
   * Returns the transaction as hex-encoded bytes.
   */
  toHex(): string;
  /**
   * Returns the serialized PayoutTx as JSON.
   */
  toJson(): string;
  /**
   * Returns the transaction ID.
   */
  getTxid(): string;
  /**
   * Creates a WasmPayoutTx from a JSON string.
   */
  static fromJson(json: string): WasmPayoutTx;
}
/**
 * WASM wrapper for PeginPayoutConnector.
 *
 * This connector defines the spending conditions for the PegIn output.
 */
export class WasmPeginPayoutConnector {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Returns the Taproot address for the connector.
   *
   * # Arguments
   *
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  getAddress(network: string): string;
  /**
   * Returns the payout script as hex.
   */
  getPayoutScript(): string;
  /**
   * Returns the Taproot scriptPubKey as hex.
   *
   * # Arguments
   *
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  getScriptPubKey(network: string): string;
  /**
   * Returns the taproot script hash.
   */
  getTaprootScriptHash(): string;
  /**
   * Creates a new PeginPayoutConnector.
   *
   * # Arguments
   *
   * * `depositor` - Hex-encoded depositor public key (64 chars)
   * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
   * * `vault_keepers` - Array of hex-encoded vault keeper public keys
   * * `universal_challengers` - Array of hex-encoded universal challenger public keys
   * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
   */
  constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], timelock_pegin: number);
}
/**
 * WASM wrapper for PegInTx.
 *
 * Represents an unfunded PegIn transaction that locks funds into the vault.
 */
export class WasmPeginTx {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Returns the vault output value in satoshis.
   */
  getVaultValue(): bigint;
  /**
   * Creates a new unfunded PegIn transaction with a CPFP anchor output.
   *
   * The anchor output is appended as the last transaction output and can be
   * used for fee bumping via child-pays-for-parent.
   *
   * # Arguments
   *
   * * `depositor` - Hex-encoded depositor public key (64 chars)
   * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
   * * `vault_keepers` - Array of hex-encoded vault keeper public keys
   * * `universal_challengers` - Array of hex-encoded universal challenger public keys
   * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
   * * `pegin_amount` - Amount in satoshis to lock in the vault
   * * `depositor_claim_value` - Amount in satoshis for the depositor's claim output
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   * * `anchor_output_json` - JSON string of an [`AnchorOutput`] for CPFP fee bumping
   *   (e.g. `{"script_pubkey": "5120...", "value": 330}`)
   */
  static newWithAnchorOutput(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], timelock_pegin: number, pegin_amount: bigint, depositor_claim_value: bigint, network: string, anchor_output_json: string): WasmPeginTx;
  /**
   * Returns the vault scriptPubKey as hex.
   */
  getVaultScriptPubKey(): string;
  /**
   * Creates a new unfunded PegIn transaction without an anchor output.
   *
   * # Arguments
   *
   * * `depositor` - Hex-encoded depositor public key (64 chars)
   * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
   * * `vault_keepers` - Array of hex-encoded vault keeper public keys
   * * `universal_challengers` - Array of hex-encoded universal challenger public keys
   * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
   * * `pegin_amount` - Amount in satoshis to lock in the vault
   * * `depositor_claim_value` - Amount in satoshis for the depositor's claim output
   * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
   */
  constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], timelock_pegin: number, pegin_amount: bigint, depositor_claim_value: bigint, network: string);
  /**
   * Returns the transaction as hex-encoded bytes.
   */
  toHex(): string;
  /**
   * Returns the serialized PegInTx as JSON.
   */
  toJson(): string;
  /**
   * Returns the transaction ID.
   */
  getTxid(): string;
  /**
   * Creates a WasmPeginTx from a JSON string.
   */
  static fromJson(json: string): WasmPeginTx;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmpayouttx_free: (a: number, b: number) => void;
  readonly __wbg_wasmpeginpayoutconnector_free: (a: number, b: number) => void;
  readonly __wbg_wasmpegintx_free: (a: number, b: number) => void;
  readonly wasmpayouttx_estimateVsize: (a: number, b: number, c: number, d: number, e: number, f: number) => [bigint, number, number];
  readonly wasmpayouttx_fromJson: (a: number, b: number) => [number, number, number];
  readonly wasmpayouttx_getTxid: (a: number) => [number, number];
  readonly wasmpayouttx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly wasmpayouttx_toHex: (a: number) => [number, number];
  readonly wasmpayouttx_toJson: (a: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getPayoutScript: (a: number) => [number, number];
  readonly wasmpeginpayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmpeginpayoutconnector_getTaprootScriptHash: (a: number) => [number, number];
  readonly wasmpeginpayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
  readonly wasmpegintx_fromJson: (a: number, b: number) => [number, number, number];
  readonly wasmpegintx_getTxid: (a: number) => [number, number];
  readonly wasmpegintx_getVaultScriptPubKey: (a: number) => [number, number];
  readonly wasmpegintx_getVaultValue: (a: number) => bigint;
  readonly wasmpegintx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: bigint, k: bigint, l: number, m: number) => [number, number, number];
  readonly wasmpegintx_newWithAnchorOutput: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: bigint, k: bigint, l: number, m: number, n: number, o: number) => [number, number, number];
  readonly wasmpegintx_toHex: (a: number) => [number, number];
  readonly wasmpegintx_toJson: (a: number) => [number, number, number, number];
  readonly init_panic_hook: () => void;
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
