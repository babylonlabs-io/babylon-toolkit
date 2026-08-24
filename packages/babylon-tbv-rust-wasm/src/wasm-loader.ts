// The generated declarations are committed under dist/generated and are the
// only description of the pinned wasm-bindgen surface. Typing the lazy binding
// against them turns a renamed or removed export into a compile error instead
// of a `new undefined(...)` at first use.
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
    try {
      const bindings = await importGeneratedBindings();
      await bindings.default();
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
