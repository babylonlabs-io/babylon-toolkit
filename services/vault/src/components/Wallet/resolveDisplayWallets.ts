/**
 * Resolve the wallet metadata (name + icon) used to render the connected-wallet
 * avatars in the header and the wallet menu.
 *
 * The header/menu connection state and addresses come from the provider hooks
 * (`useBTCWallet` / `useETHWallet`), but the icon historically came only from
 * the connector's `selectedWallets` widget state. On a page refresh the provider
 * address can be restored a tick before (or without) `selectedWallets[chain]`
 * being repopulated by the connector's `connect` event — so the address shows
 * while the icon goes blank. To keep the icon aligned with the real connection
 * state, fall back through progressively more stable sources:
 *   1. `selectedWallets[chain]` — the live widget selection (best, has the exact wallet)
 *   2. `connector.connectedWallet` — the connector's own connected wallet
 *   3. `connector.wallets.find(installed)` — the installed wallet metadata
 *      (stable: ETH only exposes AppKit; the vault only enables UniSat for BTC)
 *
 * A chain is only included when its provider reports connected, so we never show
 * an icon for a wallet that isn't actually connected.
 */

interface WalletDisplayMeta {
  name: string;
  icon: string;
}

/** Minimal shape we read off an `IWallet` — keeps this helper test-friendly. */
interface WalletLike {
  name: string;
  icon: string;
  installed: boolean;
}

/** Minimal shape we read off a chain `WalletConnector`. */
interface ConnectorLike {
  connectedWallet: WalletLike | null;
  wallets: WalletLike[];
}

function resolveChainWallet(
  selected: { name: string; icon: string } | undefined,
  connector: ConnectorLike | null | undefined,
): WalletDisplayMeta | undefined {
  const wallet =
    selected ??
    connector?.connectedWallet ??
    connector?.wallets.find((w) => w.installed);

  return wallet ? { name: wallet.name, icon: wallet.icon } : undefined;
}

export interface ResolveDisplayWalletsParams {
  selectedWallets: Record<string, { name: string; icon: string } | undefined>;
  btcConnected: boolean;
  ethConnected: boolean;
  btcConnector: ConnectorLike | null | undefined;
  ethConnector: ConnectorLike | null | undefined;
}

/**
 * Build the display map keyed by chain ("BTC" / "ETH"). Only connected chains
 * with a resolvable wallet are included.
 */
export function resolveDisplayWallets({
  selectedWallets,
  btcConnected,
  ethConnected,
  btcConnector,
  ethConnector,
}: ResolveDisplayWalletsParams): Record<string, WalletDisplayMeta> {
  const result: Record<string, WalletDisplayMeta> = {};

  if (btcConnected) {
    const btc = resolveChainWallet(selectedWallets["BTC"], btcConnector);
    if (btc) result["BTC"] = btc;
  }

  if (ethConnected) {
    const eth = resolveChainWallet(selectedWallets["ETH"], ethConnector);
    if (eth) result["ETH"] = eth;
  }

  return result;
}
