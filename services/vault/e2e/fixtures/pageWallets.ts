/**
 * Page-side wallet providers, so a test can drive the app connected (#1592).
 *
 * `walletInjection.ts` describes the shape this was expected to take: an app
 * seam reading `window.__BABYLON_E2E_WALLETS__`. That is not what landed
 * here, for a reason worth stating - nothing in `src/` reads that global, and
 * adding a production code path whose only caller is a test is a worse trade
 * than using the seams the wallet stack already exposes to any browser
 * extension. Both providers below are shaped exactly as the extension the app
 * expects, and neither package nor app changes to accommodate them.
 *
 *  - **BTC** impersonates the UniSat extension on `window.unisat`.
 *    `window.btcwallet` - wallet-connector's generic `injectable` adapter -
 *    looks like the obvious choice and is a dead end: the vault puts
 *    `injectable` in `ALWAYS_DISABLED_WALLETS`, because a deposit needs
 *    `deriveContextHash` and that adapter can only stub it. UniSat is the
 *    wallet the replayed recording was itself captured with.
 *  - **ETH** announces an EIP-6963 provider. AppKit's `WagmiAdapter` leaves
 *    multi-injected-provider discovery on, so wagmi builds a connector for it
 *    exactly as it would for MetaMask, and `reconnectOnMount` (set in
 *    `src/providers.tsx`) authorises it silently because `eth_accounts`
 *    answers with an account. That silence is the point:
 *    `AppKitProvider.connectWallet` returns early when wagmi already has an
 *    account, so AppKit's modal - which fetches its wallet catalogue from
 *    api.web3modal.org, a host the capture blocks - never opens.
 *
 * These providers connect and read. They do not sign: every signing method
 * throws, so a test that walks into a signing step fails there rather than
 * appearing to succeed. Captures stop at the deposit form for exactly that
 * reason.
 */

import { expect, type Page } from "@playwright/test";

/**
 * The UniSat build the connector's version gate demands.
 *
 * Not a round number chosen to look plausible: 1.7.14 is the first release
 * that binds `deriveContextHash` to the connected pubkey and network, which
 * is why `unisat/version.ts` refuses anything older. Reporting less means the
 * connect flow fails with "extension is out of date" instead of connecting.
 */
const UNISAT_VERSION = "1.7.14";

/** UniSat's own name for signet, as its `getChain()` reports it. */
const UNISAT_SIGNET_CHAIN = {
  enum: "BITCOIN_SIGNET",
  name: "BITCOIN_SIGNET",
  network: "testnet",
} as const;

/**
 * A 1x1 transparent SVG. Inline rather than a URL because the capture blocks
 * every offsite request, and a remote icon would render as a broken image in
 * any screenshot that includes the wallet menu.
 */
const BLANK_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=";

/**
 * What every signing method rejects with. Names the fix so the failure reads
 * as a deliberate boundary rather than a broken fixture.
 */
const CAPTURE_WALLETS_NEVER_SIGN =
  "capture wallets never sign - extend the recording instead";

export interface PageWalletConfig {
  /** BTC address the wallet reports; must be the one the recording funds. */
  readonly btcAddress: string;
  /** Compressed public key hex the BTC wallet reports. */
  readonly btcPublicKeyHex: string;
  /** ETH account the wallet reports; must be the recording's depositor. */
  readonly ethAddress: string;
  /** Chain id as a hex quantity, e.g. `0xaa36a7` for Sepolia. */
  readonly ethChainIdHex: string;
  /** Where unhandled JSON-RPC is forwarded - the replayed endpoint. */
  readonly ethRpcUrl: string;
}

/**
 * Install both providers before the next navigation.
 *
 * Uses `addInitScript` with a plain-data argument rather than a constructed
 * mock: the argument is structured-cloned across the Node/browser boundary,
 * which strips closures, so the providers have to be built inside the page.
 * `walletInjection.ts` calls this out as approach 1 of the two it describes;
 * this is that approach.
 */
export async function injectPageWallets(
  page: Page,
  config: PageWalletConfig,
): Promise<void> {
  await page.addInitScript(
    ([
      walletConfig,
      unisatVersion,
      signetChain,
      blankIcon,
      neverSignMessage,
    ]: readonly [
      PageWalletConfig,
      string,
      typeof UNISAT_SIGNET_CHAIN,
      string,
      string,
    ]) => {
      // ---- BTC: window.unisat --------------------------------------------
      // Shaped to the extension API `UnisatProvider` calls, not to
      // `IBTCProvider`: the adapter sits between the two and it is the
      // adapter's expectations that have to be met.
      const unisat = {
        requestAccounts: async () => [walletConfig.btcAddress],
        getAccounts: async () => [walletConfig.btcAddress],
        getPublicKey: async () => walletConfig.btcPublicKeyHex,
        getVersion: async () => unisatVersion,
        getChain: async () => signetChain,
        switchChain: async () => signetChain,
        // `{ list, total }` is the paging shape the adapter walks; an empty
        // first page ends the walk immediately.
        getInscriptions: async () => ({ list: [], total: 0 }),
        // Throwing, not returning the input: a well-formed UNSIGNED PSBT is
        // what a caller reads as a successful signature, and it would carry
        // on. Nothing on the captured path signs - connect goes through
        // `requestAccounts` / `getPublicKey` / `getVersion` - so failing loudly
        // here costs nothing today and is the behaviour the seam wants when a
        // capture is one day extended past the form.
        signPsbt: async () => {
          throw new Error(neverSignMessage);
        },
        signPsbts: async () => {
          throw new Error(neverSignMessage);
        },
        signMessage: async () => {
          throw new Error(neverSignMessage);
        },
        // Deterministic, and deliberately NOT the real derivation: it exists
        // so capability detection passes. Anything that consumed it for real
        // would be deriving vault secrets from a test fixture, which is why
        // captures stop before any step that does.
        deriveContextHash: async (appName: string, context: string) => {
          const bytes = new TextEncoder().encode(`${appName}:${context}`);
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        },
        on: () => {},
        removeListener: () => {},
      };
      Object.defineProperty(window, "unisat", {
        value: unisat,
        configurable: true,
        writable: true,
      });

      // ---- ETH: EIP-1193 provider, announced over EIP-6963 ----------------
      type Listener = (payload: unknown) => void;
      const listeners = new Map<string, Set<Listener>>();

      const request = async ({
        method,
        params,
      }: {
        method: string;
        params?: unknown[];
      }): Promise<unknown> => {
        switch (method) {
          // Both answer without a prompt. `eth_accounts` is what wagmi's
          // reconnect calls to decide the connector is already authorised; if
          // it came back empty the app would fall through to opening AppKit's
          // modal and the capture would stall on a blocked request.
          case "eth_accounts":
          case "eth_requestAccounts":
            return [walletConfig.ethAddress];
          case "eth_chainId":
            return walletConfig.ethChainIdHex;
          case "net_version":
            return String(Number.parseInt(walletConfig.ethChainIdHex, 16));
          // Answered rather than rejected: the app switches the wallet to its
          // configured chain on connect, and a rejection there surfaces as a
          // "wrong network" banner across every captured screen.
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            return null;
          default: {
            // Reads the app routes through the wallet rather than through its
            // own transport still have to be answered, and the replayed
            // endpoint is the only thing that can answer them. Signing methods
            // land here too and fail, which is intended.
            const response = await fetch(walletConfig.ethRpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method,
                params: params ?? [],
              }),
            });
            const payload = (await response.json()) as {
              result?: unknown;
              error?: { message?: string };
            };
            if (payload.error) {
              throw new Error(
                `${method} is not answerable by the recorded backend: ` +
                  `${payload.error.message ?? "unknown error"}`,
              );
            }
            return payload.result;
          }
        }
      };

      const ethProvider = {
        request,
        on: (event: string, listener: Listener) => {
          const set = listeners.get(event) ?? new Set<Listener>();
          set.add(listener);
          listeners.set(event, set);
        },
        removeListener: (event: string, listener: Listener) => {
          listeners.get(event)?.delete(listener);
        },
        isMetaMask: false,
      };

      const info = {
        uuid: "00000000-0000-4000-8000-000000000000",
        name: "E2E Capture Wallet",
        icon: blankIcon,
        rdns: "io.babylonlabs.e2e.capture",
      };

      const announce = () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({ info, provider: ethProvider }),
          }),
        );
      };
      // Announce on request AND immediately: wagmi listens before asking, but
      // the order of the two is not guaranteed across a navigation, and a
      // provider announced only once - before wagmi is listening - is a
      // provider nobody sees.
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    [
      config,
      UNISAT_VERSION,
      UNISAT_SIGNET_CHAIN,
      BLANK_ICON,
      CAPTURE_WALLETS_NEVER_SIGN,
    ] as const,
  );
}

/**
 * Drive the app's own connect dialog to a connected session.
 *
 * Deliberately the real UI rather than seeding wallet-connector's
 * `baby-connected-wallet-accounts` entry. Two reasons: its auto-reconnect
 * path explicitly excludes ETH (`core/index.ts`), so seeding could only ever
 * connect half the session; and a capture that clicks what a depositor clicks
 * cannot drift away from the flow it is supposed to be photographing.
 *
 * The ETH side needs no interaction - wagmi has already authorised the
 * announced provider by the time the dialog opens, so the dialog shows the
 * account and only Bitcoin is left to choose.
 */
export async function connectInjectedWallets(page: Page): Promise<void> {
  // By testid, not by its label: the header control is a labelled button on
  // desktop and an icon-only button on mobile, so a text match connects at one
  // width and times out at the other.
  await page.getByTestId("connect-wallet-button").first().click();

  const dialog = page.locator(".portal-root");
  // Every control below is driven by the SAME testid the real-wallet CLI uses
  // (`e2e/real/actions/walletConnect.ts`), not by its label. Matching on
  // "Select Bitcoin Wallet" / "Unisat" / "Connect" would mean a copy edit
  // breaks this capture with a bare timeout while that runner keeps passing -
  // the opposite of the guarantee the deposit spec claims when it deliberately
  // reuses `deposit-button`.
  await dialog.getByTestId("select-bitcoin-wallet-button").click();
  // By id, not by position: the list is ordered by the connector's own ranking
  // and a positional click would silently select a different wallet the day
  // that ordering changes.
  await dialog.getByTestId("wallet-option-unisat").click();

  // The dialog returns to its summary once BTC is chosen; this button is what
  // commits the session. Waiting for it to be enabled is what makes this
  // robust - it stays disabled until both required chains are satisfied, so
  // this is also the assertion that ETH really did connect silently.
  const commit = dialog.getByTestId("chains-connect-button");
  await expect(commit).toBeEnabled();
  await commit.click();

  // The dialog is a full-viewport overlay: anything clicked before it is gone
  // hits the overlay instead, which surfaces as an unrelated timeout further
  // down the test. The commit button leaving the DOM is the dialog being gone,
  // and unlike its heading it is not copy.
  await expect(commit).toHaveCount(0);
}
