import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The generated declarations are committed under dist/generated and are the
// only description of the pinned wasm-bindgen surface. Typing the lazy binding
// against them turns a renamed or removed export into a compile error instead
// of a `new undefined(...)` at first use.
// tsc copies this specifier into the emitted declaration unchanged, so it has
// to resolve from dist as well as from src. It does that only while both stay
// siblings one level under the package root; check-lazy-entries.js asserts it.
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
    let bindings: WasmBindings;
    let binary: Buffer;
    try {
      bindings = await importGeneratedBindings();
      binary = await readFile(
        join(
          dirname(fileURLToPath(import.meta.url)),
          'generated',
          'vault_wasm_bg.wasm',
        ),
      );
    } catch (error) {
      // Neither a failed resolve nor a failed read initializes anything, so a
      // later call can still work. Only the init below is terminal.
      bindingsPromise = null;
      throw error;
    }
    // The glue sets `wasm = instance.exports` before it runs
    // `__wbindgen_start()`, and its own `if (wasm !== undefined) return wasm`
    // guard would then hand that half-started module to a retry. Keep this
    // rejection latched: only a fresh module graph can safely retry.
    bindings.initSync({ module: binary });
    return bindings;
  })();
  return bindingsPromise;
}

export async function initWasm(): Promise<void> {
  await getWasmBindings();
}
