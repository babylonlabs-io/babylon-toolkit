/**
 * `window.__BABYLON_E2E_WALLETS__` is the contract between Playwright
 * and the running app. The app reads it via `getInjectedWallets()`.
 *
 * Populating it from a Playwright test is NOT a matter of passing
 * `createMockBtcWallet()` to `page.addInitScript` - that helper
 * structured-clones its argument across the Node/browser process
 * boundary, which strips the closures inside `provider` and `script`
 * and leaves empty objects on the page side. The mocks must be
 * constructed inside the page context. Two viable approaches:
 *
 *   1. Inline factory: pass the addInitScript callback a plain config
 *      object and rebuild the mock there (the callback body runs in
 *      the page context, so its closures stay intact).
 *   2. Bundled script: build the fixture module to a single file and
 *      inject it with `page.addScriptTag({ path })` so the page can
 *      call the factory directly.
 *
 * `wallet-mocks.spec.ts` exercises only the global itself with a
 * plain-data sentinel; the full page-side injection wiring lands
 * with the single-vault deposit happy-path ticket.
 *
 * The injection point is gated on `import.meta.env.NEXT_PUBLIC_E2E_MODE`
 * - reading from this global in any other build mode throws, so a
 * stray production reference fails loudly instead of silently
 * returning mock data.
 *
 * The gate is intentionally per-build, not per-environment: a build
 * produced with `NEXT_PUBLIC_E2E_MODE=1` (the Playwright dev server,
 * staging-style e2e bundles) is allowed to read the global. Production
 * builds must never set this var.
 */

import type { MockBtcWallet } from "./mockBtcWallet";
import type { MockEthWallet } from "./mockEthWallet";

export const E2E_WALLETS_GLOBAL = "__BABYLON_E2E_WALLETS__" as const;

export interface InjectedWallets {
  btc?: MockBtcWallet;
  eth?: MockEthWallet;
}

declare global {
  // Augment Window so callers don't need `(window as any)` casts.
  interface Window {
    [E2E_WALLETS_GLOBAL]?: InjectedWallets;
  }
}

function isE2EMode(): boolean {
  // Vitest-only escape hatch for the helper's own unit tests. We use
  // `process.env.VITEST` (set by vitest itself) rather than
  // `NODE_ENV === "test"` because the latter is set globally for any
  // vitest run and would let unrelated `src/` code under test toggle
  // the gate by transitively importing this module.
  if (typeof process !== "undefined" && process.env?.VITEST === "true") {
    return true;
  }
  if (typeof import.meta === "undefined") return false;
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.NEXT_PUBLIC_E2E_MODE === "1";
}

/**
 * Install the mocks on `window`. Throws outside e2e mode so a
 * production code path that accidentally imports this fails fast.
 */
export function injectWallets(wallets: InjectedWallets): void {
  if (!isE2EMode()) {
    throw new Error(
      `injectWallets called outside e2e mode (NEXT_PUBLIC_E2E_MODE !== "1"). ` +
        `This is a bug - mock wallets must never run in production.`,
    );
  }
  if (typeof window === "undefined") {
    throw new Error("injectWallets called in a non-window environment");
  }
  window[E2E_WALLETS_GLOBAL] = wallets;
}

/**
 * Read the injected mocks. Returns `undefined` outside e2e mode (so
 * application code can branch on presence without throwing) and
 * `undefined` if no test has installed any mocks yet.
 */
export function getInjectedWallets(): InjectedWallets | undefined {
  if (!isE2EMode()) return undefined;
  if (typeof window === "undefined") return undefined;
  return window[E2E_WALLETS_GLOBAL];
}

/**
 * Remove any injected mocks. Safe to call between tests. No-op outside
 * e2e mode so a stray production cleanup hook can't silently touch
 * the (never-populated) global.
 */
export function clearInjectedWallets(): void {
  if (!isE2EMode()) return;
  if (typeof window === "undefined") return;
  delete window[E2E_WALLETS_GLOBAL];
}
