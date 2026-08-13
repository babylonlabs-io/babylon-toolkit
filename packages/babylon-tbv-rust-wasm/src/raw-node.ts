/** Explicit eager Node.js entry for direct wasm-bindgen class access. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// prettier-ignore
// @ts-expect-error - generated artifacts live in dist/generated
import { initSync, WasmPeginTx, WasmPeginPayoutConnector, WasmPrePeginTx, WasmPrePeginHtlcConnector, WasmAssertPayoutNoPayoutConnector, WasmAssertChallengeAssertConnector } from './generated/vault_wasm.js';

let initialized = false;

export function initWasm(): void {
  if (initialized) return;
  const wasmPath = join(
    dirname(fileURLToPath(import.meta.url)),
    'generated',
    'vault_wasm_bg.wasm',
  );
  initSync({ module: readFileSync(wasmPath) });
  initialized = true;
}

export {
  WasmAssertChallengeAssertConnector,
  WasmAssertPayoutNoPayoutConnector,
  WasmPeginPayoutConnector,
  WasmPeginTx,
  WasmPrePeginHtlcConnector,
  WasmPrePeginTx,
};
