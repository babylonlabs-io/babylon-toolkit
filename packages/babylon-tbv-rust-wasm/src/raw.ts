import type * as Bindings from '../dist/generated/vault_wasm.js';
// @ts-expect-error - generated artifacts live in dist/generated
import * as raw from './generated/vault_wasm.js';

/** @deprecated Raw access skips SDK value checks. Use buildPeginTxFromFundedPrePegin from @babylonlabs-io/ts-sdk/tbv/core/primitives. */
export const WasmPeginTx: typeof Bindings.WasmPeginTx = raw.WasmPeginTx;
export type WasmPeginTx = Bindings.WasmPeginTx;

/** @deprecated Raw access skips SDK value checks. Use buildPayoutPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. */
export const WasmPeginPayoutConnector: typeof Bindings.WasmPeginPayoutConnector =
  raw.WasmPeginPayoutConnector;
export type WasmPeginPayoutConnector = Bindings.WasmPeginPayoutConnector;

/** @deprecated Raw access skips SDK value checks. Use buildPrePeginPsbt or buildRefundPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. */
export const WasmPrePeginTx: typeof Bindings.WasmPrePeginTx =
  raw.WasmPrePeginTx;
export type WasmPrePeginTx = Bindings.WasmPrePeginTx;

/** @deprecated Raw access skips SDK value checks. Use buildPeginInputPsbt or buildRefundPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. */
export const WasmPrePeginHtlcConnector: typeof Bindings.WasmPrePeginHtlcConnector =
  raw.WasmPrePeginHtlcConnector;
export type WasmPrePeginHtlcConnector = Bindings.WasmPrePeginHtlcConnector;

export { initWasm } from './wasm-loader.js';
