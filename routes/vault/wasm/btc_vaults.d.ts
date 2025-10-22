/* tslint:disable */
/* eslint-disable */
export function init_panic_hook(): void;
export class WasmPeginTx {
  free(): void;
  constructor(deposit_txid: string, deposit_vout: number, deposit_value: bigint, deposit_script_pubkey: string, depositor_pubkey: string, claimer_pubkey: string, challenger_pubkeys: string[], pegin_amount: bigint, fee: bigint, network: string);
  toHex(): string;
  getTxid(): string;
  getVaultScriptPubKey(): string;
  getVaultValue(): bigint;
  getChangeValue(): bigint;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmpegintx_free: (a: number, b: number) => void;
  readonly wasmpegintx_new: (a: number, b: number, c: number, d: bigint, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: bigint, n: bigint, o: number, p: number) => [number, number, number];
  readonly wasmpegintx_toHex: (a: number) => [number, number];
  readonly wasmpegintx_getTxid: (a: number) => [number, number];
  readonly wasmpegintx_getVaultScriptPubKey: (a: number) => [number, number];
  readonly wasmpegintx_getVaultValue: (a: number) => bigint;
  readonly wasmpegintx_getChangeValue: (a: number) => bigint;
  readonly init_panic_hook: () => void;
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_3: WebAssembly.Table;
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
