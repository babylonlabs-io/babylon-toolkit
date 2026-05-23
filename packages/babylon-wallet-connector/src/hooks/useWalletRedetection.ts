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
    // Chains with a stored-session reconnect already in flight, so the two
    // cold-start triggers (ready event + fallback timer) firing before it
    // settles don't fire duplicate `connect()`s. Persists across redetect calls
    // within this effect instance.
    const reconnecting = new Set<string>();
    // Chains that participated in late-injection redetection (their wallet
    // `appeared` after the one-shot init detection) and still need their stored
    // session restored. Only these are eligible for redetect reconnect — so
    // ETH/AppKit (never late-injects) and normally-detected wallets (init
    // auto-reconnect handles them) are excluded. Persists across passes so a
    // modal-open detect-only pass that swaps a wallet in is still restored by a
    // later cold-start pass.
    const pendingRestore = new Set<string>();

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
      // 1. Re-detect connectors whose wallet injected after the one-shot
      //    detection in init() (e.g. UniSat) and swap the now-installed ones in.
      const stale = (
        Object.values(connectorsRef.current).filter(Boolean) as WalletConnector<string, IProvider, any>[]
      ).filter((c) => !c.connectedWallet && c.wallets.some((w) => w.id !== "injectable" && !w.installed));

      let swapIn: WalletConnector<string, IProvider, any>[] = [];
      if (stale.length > 0) {
        const rebuilt = await Promise.all(
          stale.map((c) =>
            createWalletConnector<string, IProvider, any>({
              // `persistent: false` — this rebuild only re-detects providers; the
              // stored-session reconnect is done explicitly in step 2 so it can
              // also cover connectors an earlier detect-only pass already swapped in.
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

        // These chains late-injected — mark them eligible for stored-session
        // restore (carried across passes, so a detect-only modal-open pass is
        // still restored by a later cold-start pass).
        for (const c of appeared) pendingRestore.add(c.id);

        // Swap in the appeared connectors whose currently-in-state counterpart
        // hasn't connected in the meantime. Computed synchronously (not inside
        // the updater) so it doesn't depend on side effects in the deferred /
        // possibly double-invoked state updater.
        const current = connectorsRef.current;
        swapIn = appeared.filter((c) => !current[c.id as keyof Connectors]?.connectedWallet);
        if (swapIn.length > 0) {
          setConnectors((prev) => {
            const next: Record<string, WalletConnector<string, IProvider, any>> = {};
            for (const c of swapIn) {
              // Re-check at commit time for the tiny window since `swapIn` was computed.
              if (prev[c.id as keyof Connectors]?.connectedWallet) continue;
              next[c.id] = c;
            }
            return Object.keys(next).length > 0 ? ({ ...prev, ...next } as Connectors) : prev;
          });
        }
      }

      // 2. Restore persisted sessions (cold-start triggers only — the modal-open
      //    trigger stays detect-only so it can't race a manual connect). Only
      //    chains in `pendingRestore` (late-injected this session) are eligible,
      //    so ETH/AppKit and normally-detected wallets are never reconnected
      //    here. The in-state instance is taken from swapIn (this pass) or
      //    current, so a session swapped in by an earlier detect-only pass is
      //    still restored.
      if (!allowReconnect || !persistent || pendingRestore.size === 0) return;
      const inState: Record<string, WalletConnector<string, IProvider, any>> = {};
      for (const c of Object.values(connectorsRef.current)) {
        if (c) inState[c.id] = c as WalletConnector<string, IProvider, any>;
      }
      for (const c of swapIn) inState[c.id] = c;

      const reconnectTargets = selectRedetectReconnectTargets({
        connectors: Object.values(inState),
        storage,
        allowReconnect,
        persistent,
        eligibleChainIds: pendingRestore,
      });
      for (const { connector, walletId } of reconnectTargets) {
        if (reconnecting.has(connector.id)) continue;
        reconnecting.add(connector.id);
        // Fire-and-forget: `connect` swallows its own errors (returns null on
        // failure); a locked/unresponsive wallet must not block re-detection.
        // The connect event flows through the normal ChainProvider bump /
        // BTCWalletProvider / selectWallet wiring (which repopulates selectedWallets).
        void connector
          .connect(walletId)
          .then((wallet) => {
            reconnecting.delete(connector.id);
            // Restored — stop treating this chain as pending so later cold-start
            // passes don't reconnect it again. On failure `connect` resolves
            // null, so it stays pending and a later trigger retries.
            if (wallet) pendingRestore.delete(connector.id);
          })
          .catch(() => reconnecting.delete(connector.id));
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
