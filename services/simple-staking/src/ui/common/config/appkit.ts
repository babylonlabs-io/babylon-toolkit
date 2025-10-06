import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { setSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import { localhost } from "@babylonlabs-io/config";
import { mainnet, sepolia } from "viem/chains";
import { http } from "viem";

// Get project ID from environment
const projectId =
  import.meta.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  "e3a2b903ffa3e74e8d1ce1c2a16e4e27";

// Get metadata URL dynamically
const getMetadataUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://btcstaking.babylonlabs.io";
};

// AppKit metadata configuration
const metadata = {
  name: "Babylon Staking",
  description: "Babylon Staking - Secure Bitcoin Staking Platform",
  url: getMetadataUrl(),
  icons: ["https://btcstaking.babylonlabs.io/favicon.ico"],
};

// Define networks for AppKit

const networks: any = [mainnet, sepolia, localhost];

// Create Wagmi adapter with explicit transports
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [localhost.id]: http("http://localhost:8545"),
  },
  ssr: false, // We're using Vite, not Next.js SSR
});

// Create and export the AppKit modal instance
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
  },
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#FF7C2A",
  },
  featuredWalletIds: [
    "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  ],
});

// Export the wagmi config for use in WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig;

// Set the shared wagmi config for the wallet-connector AppKitProvider
// This prevents multiple WalletConnect initializations
setSharedWagmiConfig(wagmiConfig);
