import type { ETHConfig, IETHProvider, WalletMetadata } from "@/core/types";
import { Network } from "@/core/types";

import { AppKitProvider } from "./provider";

const WALLET_PROVIDER_NAME = "AppKit";

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
  id: "appkit-eth-connector",
  name: WALLET_PROVIDER_NAME,
  icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzYyN0VFQSIvPgogIDxwYXRoIGQ9Ik0xNiA0TDcuNSAxNi4yNUwxNiAyMkwyNC41IDE2LjI1TDE2IDR6IiBmaWxsPSJ3aGl0ZSIvPgogIDxwYXRoIGQ9Ik0xNiAyMi43NUw3LjUgMTdMMTYgMjhMMjQuNSAxN0wxNiAyMi43NXoiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNiIvPgo8L3N2Zz4=",
  docs: "https://docs.reown.com/appkit/overview",
  wallet: "ethereum", // Global identifier for Ethereum providers
  createProvider: (_wallet: any, config: ETHConfig) => new AppKitProvider(config),
  networks: [
    Network.MAINNET, // ETH mainnet (chainId: 1)
    Network.TESTNET, // ETH testnet (chainId: 11155111 - Sepolia)
    Network.SIGNET, // Also allow SIGNET/devnet/localhost environments
  ],
  label: "Connect ETH Wallet",
};

export default metadata;
