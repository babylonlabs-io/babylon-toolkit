// tsc keeps this import path in the emitted declaration. It must resolve
// from both src and dist, which must remain siblings under the package root.
// scripts/check-lazy-entries.js checks the emitted path.
import type * as Bindings from '../dist/generated/vault_wasm.js';
import { GuardedPrePeginHtlcConnector } from './rawHtlcConnector.js';
import { GuardedPeginPayoutConnector } from './rawPayoutConnector.js';
import { GuardedPrePeginTx } from './rawPrePeginTx.js';
import { GuardedPeginTx } from './rawPeginTx.js';
export type { PeginRestoreParams } from './rawPeginTx.js';

/** @deprecated Use SDK PegIn primitives. Restoration requires the original trusted request and funded parent transaction. */
export const WasmPeginTx = GuardedPeginTx;
export type WasmPeginTx = GuardedPeginTx;

/** @deprecated Use buildPayoutPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. This class checks its payout fields against the constructor inputs. */
export const WasmPeginPayoutConnector: typeof Bindings.WasmPeginPayoutConnector =
  GuardedPeginPayoutConnector;
export type WasmPeginPayoutConnector = Bindings.WasmPeginPayoutConnector;

/** @deprecated Use SDK Pre-PegIn and refund primitives. Pass original bigint amounts; the class checks construction, funding, and transaction outputs. */
export const WasmPrePeginTx = GuardedPrePeginTx;
export type WasmPrePeginTx = GuardedPrePeginTx;

/** @deprecated Use buildPeginInputPsbt or buildRefundPsbt from @babylonlabs-io/ts-sdk/tbv/core/primitives. This class checks its HTLC fields against the constructor inputs. */
export const WasmPrePeginHtlcConnector: typeof Bindings.WasmPrePeginHtlcConnector =
  GuardedPrePeginHtlcConnector;
export type WasmPrePeginHtlcConnector = Bindings.WasmPrePeginHtlcConnector;

export { initWasm } from './wasm-loader.js';
