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
  id: "appkit",
  name: WALLET_PROVIDER_NAME,
  icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzM0ODlGRiIvPgo8cGF0aCBkPSJNOCAxNkM4IDExLjU4MTcgMTEuNTgxNyA4IDE2IDhDMjAuNDE4MyA4IDI0IDExLjU4MTcgMjQgMTZDMjQgMjAuNDE4MyAyMC40MTgzIDI0IDE2IDI0QzExLjU4MTcgMjQgOCAyMC40MTgzIDggMTZaIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiLz4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPC9zdmc+",
  docs: "https://docs.reown.com/appkit/overview",
  wallet: "ethereum", // Global identifier for Ethereum providers
  createProvider: (_wallet: any, config: ETHConfig) => new AppKitProvider(config),
  networks: [
    Network.MAINNET, // ETH mainnet (chainId: 1)
    Network.TESTNET, // ETH testnet (chainId: 11155111 - Sepolia)
  ],
  label: "Connect ETH Wallet",
};

export default metadata;
