import type { HashMap, IProvider } from "@/core/types";
import type { WalletConnector } from "@/core/WalletConnector";

/**
 * Decision (kept pure, and free of the SVG-importing wallet metadata, so it can
 * be unit-tested without React): which of the just-redetected connectors should
 * have their previously-stored session reconnected.
 *
 * A connector qualifies only when sessions are persisted, the trigger allows
 * reconnect (cold-start, not the interactive modal-open path — which must not
 * race a manual connect), its chain is **eligible** (it participated in a
 * late-injection redetection this session — see `eligibleChainIds` below),
 * storage still names a wallet for that chain, that wallet is now installed, and
 * the connector isn't already connected.
 *
 * `eligibleChainIds` is the key guard: only chains that actually late-injected
 * are eligible. ETH/AppKit never late-injects (it's always installed, so never
 * `stale`/`appeared`), so it's never eligible — which is what keeps this from
 * calling `ethConnector.connect()` and popping the AppKit modal on reload (core
 * excludes ETH from auto-reconnect for the same reason).
 */
export function selectRedetectReconnectTargets({
  connectors,
  storage,
  allowReconnect,
  persistent,
  eligibleChainIds,
}: {
  connectors: WalletConnector<string, IProvider, any>[];
  storage: Pick<HashMap, "get">;
  allowReconnect: boolean;
  persistent: boolean;
  eligibleChainIds: Set<string>;
}): { connector: WalletConnector<string, IProvider, any>; walletId: string }[] {
  if (!allowReconnect || !persistent) return [];

  const targets: { connector: WalletConnector<string, IProvider, any>; walletId: string }[] = [];
  for (const connector of connectors) {
    if (!eligibleChainIds.has(connector.id)) continue;
    if (connector.connectedWallet) continue;
    const storedWalletId = storage.get(connector.id);
    if (!storedWalletId) continue;
    if (!connector.wallets.some((w) => w.id === storedWalletId && w.installed)) continue;
    targets.push({ connector, walletId: storedWalletId });
  }
  return targets;
}
