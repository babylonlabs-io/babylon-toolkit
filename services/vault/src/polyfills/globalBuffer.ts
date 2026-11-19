import { Buffer } from "buffer";

type BufferHost = { Buffer?: typeof Buffer };

/**
 * Sets `Buffer` on `host` unless it already has one.
 *
 * Some vault code reads `globalThis.Buffer` rather than the imported polyfill
 * (see `services/deposit/fundingInputCap.ts` and `utils/btc/btcUtils.ts`).
 * vite-plugin-node-polyfills assigns that global only on the dev server (its
 * serve-mode banner); a production build rewrites bare `Buffer` references to
 * imports and never sets it. Production used to get it as a side effect of the
 * Tomo wallet SDK (`window.Buffer = bufferExports.Buffer`), which left the
 * bundle with the btc-eth entry (#2962). An existing value is kept: Node's in
 * tests, the plugin's on the dev server.
 */
export function installGlobalBuffer(host: BufferHost): void {
  host.Buffer ??= Buffer;
}

installGlobalBuffer(globalThis as BufferHost);
