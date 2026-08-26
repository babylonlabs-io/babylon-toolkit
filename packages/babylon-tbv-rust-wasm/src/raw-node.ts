/**
 * Explicit eager Node.js entry for direct wasm-bindgen class access.
 *
 * `initWasm` is re-exported from the facade's loader so that the raw and
 * facade entries share one initializer: a process that uses both must not
 * initialize the generated module twice, and must not read the binary twice.
 */
// prettier-ignore
// @ts-expect-error - generated artifacts live in dist/generated
export { WasmPeginTx, WasmPeginPayoutConnector, WasmPrePeginTx, WasmPrePeginHtlcConnector } from './generated/vault_wasm.js';
export { initWasm } from './wasm-loader-node.js';
