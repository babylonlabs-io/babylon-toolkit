import type { ETHConfig, IETHProvider, WalletMetadata } from "@/core/types";
import { Network } from "@/core/types";
import { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/appkit/constants";

import { AppKitProvider } from "./provider";

const WALLET_PROVIDER_NAME = "AppKit";

/**
 * Unique identifier for AppKit ETH wallet connector
 */
export { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/appkit/constants";

/**
 * AppKit wallet metadata for ETH chain
 *
 * Provides connection to 600+ Ethereum wallets through Reown's AppKit:
 * - MetaMask, Rainbow, WalletConnect, Coinbase Wallet, Trust Wallet, etc.
 * - Browser extension wallets (EIP-6963)
 * - Mobile wallets via WalletConnect
 * - Hardware wallets (Ledger, Trezor)
 */
const metadata: WalletMetadata<IETHProvider, ETHConfig> = {
  id: APPKIT_ETH_CONNECTOR_ID,
  name: WALLET_PROVIDER_NAME,
  icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzYyN0VFQSIvPgogIDxwYXRoIGQ9Ik0xNiA0TDcuNSAxNi4yNUwxNiAyMkwyNC41IDE2LjI1TDE2IDR6IiBmaWxsPSJ3aGl0ZSIvPgogIDxwYXRoIGQ9Ik0xNiAyMi43NUw3LjUgMTdMMTYgMjhMMjQuNSAxN0wxNiAyMi43NXoiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNiIvPgo8L3N2Zz4=",
  docs: "https://docs.reown.com/appkit/overview",
  // No `wallet` global: AppKit reaches wallets through its own EIP-6963,
  // WalletConnect and hardware transports, none of which require an injected
  // `window.ethereum`. Gating on that global made every user without an EVM
  // browser extension (Safari, WalletConnect-QR, hardware-only) fail with
  // "Provider not found" before the AppKit modal could open — and ETH is a
  // required chain for deposit. Mirrors the BTC AppKit entry.
  wallet: undefined,
  createProvider: (_wallet: any, config: ETHConfig) => new AppKitProvider(config),
  networks: [
    Network.MAINNET, // ETH mainnet (chainId: 1)
    Network.TESTNET, // ETH testnet (chainId: 11155111 - Sepolia)
    Network.SIGNET, // Also allow SIGNET/devnet/localhost environments
  ],
  label: "Connect ETH Wallet",
};

export default metadata;
