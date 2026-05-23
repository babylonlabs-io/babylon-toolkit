import type { HashMap, IProvider } from "@/core/types";
import type { WalletConnector } from "@/core/WalletConnector";

/**
 * Decision (kept pure, and free of the SVG-importing wallet metadata, so it can
 * be unit-tested without React): which of the just-redetected connectors should
 * have their previously-stored session reconnected.
 *
 * A connector qualifies only when sessions are persisted, the trigger allows
 * reconnect (cold-start, not the interactive modal-open path — which must not
 * race a manual connect), storage still names a wallet for that chain, that
 * wallet is now installed, and the connector isn't already connected.
 */
export function selectRedetectReconnectTargets({
  connectors,
  storage,
  allowReconnect,
  persistent,
}: {
  connectors: WalletConnector<string, IProvider, any>[];
  storage: Pick<HashMap, "get">;
  allowReconnect: boolean;
  persistent: boolean;
}): { connector: WalletConnector<string, IProvider, any>; walletId: string }[] {
  if (!allowReconnect || !persistent) return [];

  const targets: { connector: WalletConnector<string, IProvider, any>; walletId: string }[] = [];
  for (const connector of connectors) {
    if (connector.connectedWallet) continue;
    const storedWalletId = storage.get(connector.id);
    if (!storedWalletId) continue;
    if (!connector.wallets.some((w) => w.id === storedWalletId && w.installed)) continue;
    targets.push({ connector, walletId: storedWalletId });
  }
  return targets;
}
