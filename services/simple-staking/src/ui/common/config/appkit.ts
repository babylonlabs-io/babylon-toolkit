import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, sepolia } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

// Get configuration from environment variables
const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  "e3a2b903ffa3e74e8d1ce1c2a16e4e27";
const chainId = parseInt(process.env.NEXT_PUBLIC_ETH_CHAIN_ID || "11155111");

// Determine networks based on environment
const networks: [AppKitNetwork, ...AppKitNetwork[]] =
  chainId === 1 ? [mainnet] : [sepolia];

// Set up wagmi adapter
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false, // Client-side only for Vite
});

// App metadata
const metadata = {
  name: "Babylon Vault",
  description: "BTC and ETH Staking Platform",
  url: "https://babylon.io",
  icons: ["https://babylon.io/icon.png"],
};

// Create and configure AppKit
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: false,
  },
  defaultNetwork: networks[0],
});

// Export wagmi config for providers
export const wagmiConfig = wagmiAdapter.wagmiConfig;
