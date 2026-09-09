// tsc keeps this import path in the emitted declaration. It must resolve
// from both src and dist, which must remain siblings under the package root.
// scripts/check-lazy-entries.js checks the emitted path.
import type * as Bindings from '../dist/generated/vault_wasm.js';
// @ts-expect-error - generated artifacts live in dist/generated
import * as raw from './generated/vault_wasm.js';
import { GuardedPrePeginHtlcConnector } from './rawHtlcConnector.js';
import { GuardedPeginPayoutConnector } from './rawPayoutConnector.js';

/** @deprecated Raw access skips SDK value checks. Use buildPeginTxFromFundedPrePegin from @babylonlabs-io/ts-sdk/tbv/core/primitives for construction. For fromJson/toJson, see https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/guides/raw-engine-migration.md#compatibility-blocker-and-release. */
export const WasmPeginTx: typeof Bindings.WasmPeginTx = raw.WasmPeginTx;
export type WasmPeginTx = Bindings.WasmPeginTx;

/** @deprecated Use buildPayoutPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. This class checks its payout fields against the constructor inputs. */
export const WasmPeginPayoutConnector: typeof Bindings.WasmPeginPayoutConnector =
  GuardedPeginPayoutConnector;
export type WasmPeginPayoutConnector = Bindings.WasmPeginPayoutConnector;

/** @deprecated Raw access skips SDK value checks. Use buildPrePeginPsbt, buildPeginTxFromFundedPrePegin, or buildRefundPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. */
export const WasmPrePeginTx: typeof Bindings.WasmPrePeginTx =
  raw.WasmPrePeginTx;
export type WasmPrePeginTx = Bindings.WasmPrePeginTx;

/** @deprecated Use buildPeginInputPsbt or buildRefundPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. This class checks its HTLC fields against the constructor inputs. */
export const WasmPrePeginHtlcConnector: typeof Bindings.WasmPrePeginHtlcConnector =
  GuardedPrePeginHtlcConnector;
export type WasmPrePeginHtlcConnector = Bindings.WasmPrePeginHtlcConnector;

export { initWasm } from './wasm-loader.js';
