import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";

import { createWalletConnector } from "@/core";
import type { HashMap, IProvider } from "@/core/types";
import type { WalletConnector } from "@/core/WalletConnector";
import metadata from "@/core/wallets";
import type { ChainConfigArr, Connectors } from "@/context/Chain.context";

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
 * Once the connectors are built, this re-detects exactly once — on whichever
 * fires first: UniSat's `unisat#initialized` event, or a short fallback
 * timeout (covers wallets that emit no ready event). Same approach wagmi and
 * MetaMask's `detect-provider` use for this race. Only not-yet-connected
 * chains with an undetected wallet are rebuilt, and the merge re-checks
 * connection state, so a live connection is never dropped.
 *
 * The rebuild passes `persistent: false` — it only re-detects providers and
 * never auto-reconnects a stored session (which would race a manual connect
 * on the pre-rebuild connector and double-prompt the wallet). A session that
 * lost the race needs one manual reconnect, still strictly better than the
 * wallet showing as not installed.
 */
export function useWalletRedetection({
  connectors,
  setConnectors,
  config,
  context,
  storage,
  disabledWallets,
}: UseWalletRedetectionParams): void {
  // Mirror the latest connectors into a ref so the effect reads current
  // state without depending on it (which would re-run it).
  const connectorsRef = useRef(connectors);
  connectorsRef.current = connectors;

  // True once `init()` has populated the connectors.
  const connectorsBuilt = Object.values(connectors).some(Boolean);

  useEffect(() => {
    // Arm only after `init()` has populated connectors — otherwise a fast
    // event/timeout could consume the one re-detect against an empty set.
    if (!connectorsBuilt) return;

    let ran = false; // dedupe: event vs. fallback timeout
    let cancelled = false; // effect cleaned up
    const FALLBACK_MS = 3000;

    const redetect = async () => {
      if (ran || cancelled) return;
      ran = true;

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

      setConnectors((prev) => {
        const merged: Record<string, WalletConnector<string, IProvider, any>> = {};
        for (const c of appeared) {
          // A connection may have landed since `appeared` was computed —
          // never overwrite a now-connected connector.
          if (prev[c.id as keyof Connectors]?.connectedWallet) continue;
          merged[c.id] = c;
        }
        return Object.keys(merged).length > 0 ? ({ ...prev, ...merged } as Connectors) : prev;
      });
    };

    const timer = setTimeout(redetect, FALLBACK_MS);
    const hasWindow = typeof window !== "undefined";
    if (hasWindow) window.addEventListener("unisat#initialized", redetect, { once: true });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (hasWindow) window.removeEventListener("unisat#initialized", redetect);
    };
  }, [connectorsBuilt, config, context, storage, disabledWallets, setConnectors]);
}
