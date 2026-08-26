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
  // Generated artifacts are committed under dist/generated and deliberately
  // absent from src. The build includes their declarations separately.
  // @ts-expect-error - generated during the pinned Rust/WASM build
  return import('./generated/vault_wasm.js');
}

/** Load and initialize browser WASM only when a facade operation is invoked. */
export function getWasmBindings(): Promise<WasmBindings> {
  bindingsPromise ??= (async () => {
    let bindings: WasmBindings;
    try {
      bindings = await importGeneratedBindings();
    } catch (error) {
      // A failed resolve initializes nothing, so a later call can still work.
      bindingsPromise = null;
      throw error;
    }
    // The glue sets `wasm = instance.exports` before it runs
    // `__wbindgen_start()`, and its own `if (wasm !== undefined) return wasm`
    // guard would then hand that half-started module to a retry. Keep this
    // rejection latched: only a fresh module graph can safely retry.
    await bindings.default();
    return bindings;
  })();
  return bindingsPromise;
}

export async function initWasm(): Promise<void> {
  await getWasmBindings();
}
