/**
 * Explicit eager access to wasm-bindgen's generated browser module.
 *
 * Most consumers should use the package root, whose facade loads this module
 * lazily. This subpath exists for low-level callers that construct raw WASM
 * classes directly and therefore necessarily opt into eager glue loading.
 */
// prettier-ignore
// @ts-expect-error - generated artifacts live in dist/generated
export { default as initWasm, WasmPeginTx, WasmPeginPayoutConnector, WasmPrePeginTx, WasmPrePeginHtlcConnector, WasmAssertPayoutNoPayoutConnector, WasmAssertChallengeAssertConnector } from './generated/vault_wasm.js';
