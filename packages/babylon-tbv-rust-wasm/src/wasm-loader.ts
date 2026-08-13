let bindingsPromise: ReturnType<typeof importGeneratedBindings> | null = null;

async function importGeneratedBindings() {
  // Generated artifacts are committed under dist/generated and deliberately
  // absent from src. The build includes their declarations separately.
  // @ts-expect-error - generated during the pinned Rust/WASM build
  return import('./generated/vault_wasm.js');
}

/** Load and initialize browser WASM only when a facade operation is invoked. */
export function getWasmBindings() {
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
