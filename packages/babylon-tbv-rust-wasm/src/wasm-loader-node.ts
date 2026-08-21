import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bindingsPromise: ReturnType<typeof importGeneratedBindings> | null = null;

async function importGeneratedBindings() {
  // @ts-expect-error - generated artifacts live in dist/generated
  return import('./generated/vault_wasm.js');
}

/** Load generated glue and synchronously initialize its local binary on demand. */
export function getWasmBindings() {
  bindingsPromise ??= (async () => {
    try {
      const bindings = await importGeneratedBindings();
      const wasmPath = join(
        dirname(fileURLToPath(import.meta.url)),
        'generated',
        'vault_wasm_bg.wasm',
      );
      bindings.initSync({ module: readFileSync(wasmPath) });
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
