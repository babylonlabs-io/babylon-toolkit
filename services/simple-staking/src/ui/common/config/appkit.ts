import { initializeAppKitModal } from "@babylonlabs-io/wallet-connector";
import { localhost } from "@babylonlabs-io/config";
import { mainnet, sepolia } from "viem/chains";

// Initialize AppKit modal with configuration
const { modal, wagmiConfig } = initializeAppKitModal({
  projectId:
    import.meta.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
    "e3a2b903ffa3e74e8d1ce1c2a16e4e27",
  metadata: {
    name: "Babylon Staking",
    description: "Babylon Staking - Secure Bitcoin Staking Platform",
    url: typeof window !== "undefined" ? window.location.origin : "https://btcstaking.babylonlabs.io",
    icons: ["https://btcstaking.babylonlabs.io/favicon.ico"],
  },
  networks: [mainnet, sepolia, localhost],
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#FF7C2A",
  },
  featuredWalletIds: [
    "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  ],
});

// Export for use in WagmiProvider
export { modal, wagmiConfig };