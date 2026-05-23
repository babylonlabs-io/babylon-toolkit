import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";

import { WALLET_MODAL_OPEN_EVENT } from "@/constants/walletEvents";
import { createWalletConnector } from "@/core";
import type { HashMap, IProvider } from "@/core/types";
import type { WalletConnector } from "@/core/WalletConnector";
import metadata from "@/core/wallets";
import type { ChainConfigArr, Connectors } from "@/context/Chain.context";

import { selectRedetectReconnectTargets } from "./redetectReconnect";

/** UniSat dispatches this on `window` once its provider is ready. */
const UNISAT_READY_EVENT = "unisat#initialized";

/**
 * Fallback delay for the cold-start re-detection when no wallet emits a ready
 * event. Long enough to cover UniSat's phishing-detection await, short enough
 * that a genuinely-uninstalled wallet isn't shown as "checking" for long.
 */
const FALLBACK_MS = 3000;

interface UseWalletRedetectionParams {
  /** Current connector map from `ChainProvider` state. */
  connectors: Connectors;
  /** `ChainProvider`'s connector-state setter. */
  setConnectors: Dispatch<SetStateAction<Connectors>>;
  /** Per-chain config array — same one passed to `createWalletConnector`. */
  config: Readonly<ChainConfigArr>;
  /** Wallet-detection context — typically `window`. */
  context: any;
  /** Account storage used for connector construction. */
  storage: HashMap;
  /** Wallet ids to exclude from connector construction. */
  disabledWallets?: string[];
  /**
   * Whether sessions are persisted (same flag passed to `createWalletConnector`).
   * When true, a cold-start re-detection that re-installs a previously-stored
   * wallet auto-reconnects it (see the reconnect block below).
   */
  persistent: boolean;
}

/**
 * Late-injection re-detection.
 *
 * Browser wallet extensions inject their `window` provider asynchronously
 * (e.g. UniSat's content script awaits phishing-detection before defining
 * `window.unisat`), so the one-shot detection in `ChainProvider`'s `init()`
 * can run before the extension is ready and leave a genuinely-installed
 * wallet stuck at `installed: false` — the wallet modal then shows it as a
 * download link instead of a connect button.
 *
 * Once the connectors are built, this re-detects on whichever of these fires:
 * UniSat's `unisat#initialized` event, a short fallback timeout (covers
 * wallets that emit no ready event), or every time the wallet modal opens
 * (`WALLET_MODAL_OPEN_EVENT`) — the last one covers an extension that injects
 * later than the fallback, so it still flips to a connect button by the time
 * the user looks at the list. Same event-or-timeout approach wagmi and
 * MetaMask's `detect-provider` use for this race.
 *
 * Re-detection is idempotent and safe to run repeatedly: only not-yet-connected
 * chains with an undetected wallet are rebuilt (it bails immediately when there
 * are none), and the merge re-checks connection state, so a live connection is
 * never dropped. A single in-flight guard prevents overlapping passes (e.g. the
 * event and the timeout firing close together).
 *
 * The connector *rebuild* always passes `persistent: false` so it does no
 * auto-reconnect itself. Reconnect of a previously-stored session is then
 * done explicitly, and only for the **cold-start** triggers (`unisat#initialized`
 * and the fallback timeout) where the modal is closed and there is no manual
 * connect to race. The interactive `WALLET_MODAL_OPEN_EVENT` trigger stays
 * detect-only (`allowReconnect: false`) — the user is actively choosing a wallet
 * there, so auto-reconnecting could double-prompt. Without this, a session that
 * lost the cold-start detection race (extension injected after `init()`) would
 * stay disconnected even though storage still names the wallet — leaving e.g.
 * ETH reconnected while BTC/UniSat shows as "Connect".
 */
export function useWalletRedetection({
  connectors,
  setConnectors,
  config,
  context,
  storage,
  disabledWallets,
  persistent,
}: UseWalletRedetectionParams): void {
  // Mirror the latest connectors into a ref so the effect reads current
  // state without depending on it (which would re-run it).
  const connectorsRef = useRef(connectors);
  connectorsRef.current = connectors;

  // True once `init()` has populated the connectors.
  const connectorsBuilt = Object.values(connectors).some(Boolean);

  useEffect(() => {
    // Arm only after `init()` has populated connectors — otherwise a fast
    // event/timeout could consume a re-detect against an empty set.
    if (!connectorsBuilt) return;

    let inFlight = false; // prevent overlapping passes (event vs. timeout vs. modal-open)
    let cancelled = false; // effect cleaned up

    // `allowReconnect` is true only for the non-interactive cold-start triggers
    // (see listeners below); the modal-open trigger passes false.
    const redetect = async (allowReconnect: boolean) => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        await runRedetection(allowReconnect);
      } finally {
        inFlight = false;
      }
    };

    const runRedetection = async (allowReconnect: boolean) => {
      const stale = (
        Object.values(connectorsRef.current).filter(Boolean) as WalletConnector<string, IProvider, any>[]
      ).filter((c) => !c.connectedWallet && c.wallets.some((w) => w.id !== "injectable" && !w.installed));
      if (stale.length === 0) return;

      const rebuilt = await Promise.all(
        stale.map((c) =>
          createWalletConnector<string, IProvider, any>({
            // `persistent: false` — this rebuild only re-detects providers; it
            // must not auto-reconnect a stored session, which would race a
            // manual connect on the pre-rebuild connector and double-prompt.
            persistent: false,
            metadata: metadata[c.id as keyof typeof metadata],
            context,
            config: config.find((cc) => cc.chain === c.id)?.config,
            accountStorage: storage,
            disabledWallets,
          }).catch(() => null),
        ),
      );
      if (cancelled) return;

      // Keep only chains where a wallet that was NOT installed before is
      // installed now (robust to the injectable-wallet de-dup reshaping the
      // list, vs. a plain installed-count comparison).
      const appeared = rebuilt.filter((c): c is WalletConnector<string, IProvider, any> => {
        if (!c) return false;
        const before = connectorsRef.current[c.id as keyof Connectors];
        if (!before || before.connectedWallet) return false;
        const wasInstalled = new Set(before.wallets.filter((w) => w.installed).map((w) => w.id));
        return c.wallets.some((w) => w.installed && !wasInstalled.has(w.id));
      });
      if (appeared.length === 0) return;

      // Connectors we'll actually swap in, computed synchronously: an
      // `appeared` whose currently-in-state counterpart hasn't connected in the
      // meantime. The in-state connectors and the updater's `prev` are the same
      // instances and `connectedWallet` is mutated on the instance, so reading
      // `connectorsRef.current` here is equivalent to reading `prev` — but it
      // doesn't depend on side effects inside the (deferred / possibly
      // double-invoked) state updater.
      const current = connectorsRef.current;
      const swapIn = appeared.filter((c) => !current[c.id as keyof Connectors]?.connectedWallet);
      if (swapIn.length === 0) return;

      setConnectors((prev) => {
        const next: Record<string, WalletConnector<string, IProvider, any>> = {};
        for (const c of swapIn) {
          // Re-check at commit time for the tiny window since `swapIn` was
          // computed — never overwrite a now-connected connector.
          if (prev[c.id as keyof Connectors]?.connectedWallet) continue;
          next[c.id] = c;
        }
        return Object.keys(next).length > 0 ? ({ ...prev, ...next } as Connectors) : prev;
      });

      // Restore a persisted session that lost the cold-start detection race.
      // Computed from `swapIn` (not from inside the updater), so it is
      // deterministic. The rebuilt connector is the same instance placed in
      // state, so its `connect` event flows through the normal ChainProvider
      // bump / BTCWalletProvider / selectWallet wiring (which also repopulates
      // `selectedWallets`).
      const reconnectTargets = selectRedetectReconnectTargets({
        connectors: swapIn,
        storage,
        allowReconnect,
        persistent,
      });
      for (const { connector, walletId } of reconnectTargets) {
        // Mirror the updater's commit-time skip: if the in-state connector for
        // this chain connected in the window since `swapIn` was computed, the
        // updater won't swap our rebuilt one in, so reconnecting it would just
        // hit an orphan (harmless, but pointless). `current[id]` is the same
        // live instance the updater reads as `prev[id]`, so this re-read sees a
        // connection that landed in between.
        if (current[connector.id as keyof Connectors]?.connectedWallet) continue;
        // Fire-and-forget: `connect` swallows its own errors (returns null on
        // failure); a locked/unresponsive wallet must not block re-detection.
        void connector.connect(walletId);
      }
    };

    const redetectColdStart = () => void redetect(true);
    const redetectInteractive = () => void redetect(false);

    const timer = setTimeout(redetectColdStart, FALLBACK_MS);
    const hasWindow = typeof window !== "undefined";
    if (hasWindow) {
      // Cold-start race: re-detect (and restore the stored session) once the
      // extension signals it is ready.
      window.addEventListener(UNISAT_READY_EVENT, redetectColdStart, { once: true });
      // Catch-all for an injection slower than FALLBACK_MS: re-detect whenever
      // the user opens the modal. Repeatable (not `once`); the in-flight guard
      // and the no-stale-wallets early-return keep it cheap when nothing changed.
      // Detect-only (no reconnect) so it can't race the user's manual connect.
      window.addEventListener(WALLET_MODAL_OPEN_EVENT, redetectInteractive);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (hasWindow) {
        window.removeEventListener(UNISAT_READY_EVENT, redetectColdStart);
        window.removeEventListener(WALLET_MODAL_OPEN_EVENT, redetectInteractive);
      }
    };
  }, [connectorsBuilt, config, context, storage, disabledWallets, setConnectors, persistent]);
}
