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

async function fetchGeneratedWasm(): Promise<ArrayBuffer> {
  try {
    const response = await fetch(
      new URL('./generated/vault_wasm_bg.wasm', import.meta.url),
    );
    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }
    return await response.arrayBuffer();
  } catch (cause) {
    throw new Error('The browser WASM asset could not be fetched.', { cause });
  }
}

/** Load and initialize browser WASM only when a facade operation is invoked. */
export function getWasmBindings(): Promise<WasmBindings> {
  bindingsPromise ??= (async () => {
    let bindings: WasmBindings;
    let wasmModule: WebAssembly.Module;
    try {
      bindings = await importGeneratedBindings();
      wasmModule = await WebAssembly.compile(await fetchGeneratedWasm());
    } catch (error) {
      // Generated initialization has not started, so a later call can retry.
      bindingsPromise = null;
      throw error;
    }
    // The generated glue assigns its module before it runs
    // `__wbindgen_start()`. The error class cannot show whether that assignment
    // happened, so every rejection from generated initialization stays latched.
    await bindings.default({ module_or_path: wasmModule });
    return bindings;
  })();
  return bindingsPromise;
}

export async function initWasm(): Promise<void> {
  await getWasmBindings();
}
