/**
 * Page-side wallet injection.
 *
 * The babylon-wallet-connector's injectable BTC adapter reads from
 * `window.btcwallet` and treats whatever it finds there as an
 * `IBTCProvider`. To drive the connect flow in e2e we install a
 * deterministic provider on that global *before* the dApp loads, via
 * `page.addInitScript`.
 *
 * The mock provider lives entirely in page context: `addInitScript`
 * serialises its callback to a string and re-evaluates it in the
 * browser, so any function the callback references must be defined
 * inside the callback body. Closures captured Node-side do not
 * survive the boundary. Anything the test needs to vary across runs
 * therefore travels as a plain-JSON `config` arg.
 *
 * ETH provider injection is a separate problem: the dApp uses Reown's
 * AppKit, which has its own React state machine. Mocking that lands
 * with a follow-up ticket (the per-flow deposit specs that need a
 * fully-connected wallet pair will block on it).
 */

import type { Page } from "@playwright/test";

import type { SeededBtcWallet } from "./seededWallets";

export interface BtcWalletPageConfig {
  /** Bech32 address `getAddress` returns. */
  address: string;
  /** 33-byte compressed pubkey hex `getPublicKeyHex` returns. */
  publicKeyHex: string;
  /** Network string ("mainnet" | "signet" | "testnet"). */
  network: string;
  /** Display name for the wallet menu. */
  providerName: string;
  /** Data-URI icon. */
  providerIcon: string;
  /** Marker so the page-side instance is recognisable from devtools. */
  e2e: true;
}

/**
 * Install a deterministic BTC provider on `window.btcwallet`. Must be
 * called BEFORE the first `page.goto` so the injectable adapter
 * discovers it during module evaluation.
 */
export async function injectBtcWalletProvider(
  page: Page,
  config: BtcWalletPageConfig,
): Promise<void> {
  await page.addInitScript((cfg) => {
    const SIGNED_MESSAGE_HEX = "cd".repeat(64);

    // sha256 of `${appName}:${context}` rendered as lowercase hex. The
    // deriveContextHash output must be deterministic across runs but
    // not collide with real key material - the mock prefixes the
    // appName with a marker via the chosen input.
    async function sha256Hex(input: string): Promise<string> {
      const data = new TextEncoder().encode(input);
      const buffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    const provider = {
      connectWallet: async () => undefined,
      getAddress: async () => cfg.address,
      getPublicKeyHex: async () => cfg.publicKeyHex,
      getNetwork: async () => cfg.network,
      getInscriptions: async () => [],
      getWalletProviderName: async () => cfg.providerName,
      getWalletProviderIcon: async () => cfg.providerIcon,
      // Echo the PSBT back so callers that just decode-and-re-encode keep
      // working. Tests that need a real partial signature must reach
      // into the provider via `window.btcwallet` and overwrite the
      // method per-test.
      signPsbt: async (psbtHex: string) => psbtHex,
      signPsbts: async (psbtsHexes: string[]) => [...psbtsHexes],
      signMessage: async () => SIGNED_MESSAGE_HEX,
      deriveContextHash: async (appName: string, context: string) =>
        sha256Hex(`${appName}:${context}`),
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
      },
      off: (event: string, cb: (...args: unknown[]) => void) => {
        listeners.get(event)?.delete(cb);
      },
      // Tests dispatch events by reading `window.btcwallet.__emit`.
      __emit: (event: string, ...args: unknown[]) => {
        listeners.get(event)?.forEach((cb) => cb(...args));
      },
      __e2eConfig: cfg,
    };

    (window as unknown as { btcwallet?: unknown }).btcwallet = provider;
  }, config);
}

/**
 * Convenience adapter for the seeded wallets in `seededWallets.ts`.
 * Builds the page-side config from a SeededBtcWallet so tests can
 * pass the same value to mempool route helpers and the injector.
 */
export function btcWalletConfigFromSeeded(
  wallet: SeededBtcWallet,
  overrides: Partial<BtcWalletPageConfig> = {},
): BtcWalletPageConfig {
  return {
    address: wallet.address,
    publicKeyHex: `02${"ab".repeat(32)}`,
    network: "signet",
    providerName: "E2E Mock BTC",
    providerIcon: "data:image/svg+xml;base64,PHN2Zy8+",
    e2e: true,
    ...overrides,
  };
}
