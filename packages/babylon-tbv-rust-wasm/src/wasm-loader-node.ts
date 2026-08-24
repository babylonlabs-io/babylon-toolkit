import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The generated declarations are committed under dist/generated and are the
// only description of the pinned wasm-bindgen surface. Typing the lazy binding
// against them turns a renamed or removed export into a compile error instead
// of a `new undefined(...)` at first use.
import type * as VaultWasm from '../dist/generated/vault_wasm.js';

type WasmBindings = typeof VaultWasm;

let bindingsPromise: Promise<WasmBindings> | null = null;

async function importGeneratedBindings(): Promise<WasmBindings> {
  // @ts-expect-error - generated artifacts live in dist/generated
  return import('./generated/vault_wasm.js');
}

/**
 * Load generated glue and initialize its local binary on demand.
 *
 * `initSync` needs the bytes synchronously, but the read does not have to be:
 * deferring the first load to a facade call would otherwise put a
 * multi-megabyte blocking read on a server's request path.
 */
export function getWasmBindings(): Promise<WasmBindings> {
  bindingsPromise ??= (async () => {
    try {
      const bindings = await importGeneratedBindings();
      const wasmPath = join(
        dirname(fileURLToPath(import.meta.url)),
        'generated',
        'vault_wasm_bg.wasm',
      );
      bindings.initSync({ module: await readFile(wasmPath) });
      return bindings;
    } catch (error) {
      bindingsPromise = null;
      throw error;
    }
  })();
  return bindingsPromise;
}

export async function initWasm(): Promise<void> {
  await getWasmBindings();
}
