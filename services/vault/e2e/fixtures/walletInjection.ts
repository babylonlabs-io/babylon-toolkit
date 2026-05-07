/**
 * `window.__BABYLON_E2E_WALLETS__` is the contract between Playwright
 * and the running app. Tests set it via `page.addInitScript(...)`
 * before navigation; the app reads it via `getInjectedWallets()`.
 *
 * The injection point is gated on `import.meta.env.NEXT_PUBLIC_E2E_MODE`
 * - reading from this global in any other build mode throws, so a
 * stray production reference fails loudly instead of silently
 * returning mock data.
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
  // Vite inlines `import.meta.env.MODE` and `NEXT_PUBLIC_*` at build time.
  // Vitest sets NODE_ENV=test, which we treat as e2e-equivalent for unit
  // tests of the injection helpers themselves.
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
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

/** Remove any injected mocks. Safe to call between tests. */
export function clearInjectedWallets(): void {
  if (typeof window === "undefined") return;
  delete window[E2E_WALLETS_GLOBAL];
}
