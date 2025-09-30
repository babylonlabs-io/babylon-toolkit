// TODO: Full implementation will be done in issue #216
// This is a placeholder for AppKit/Wagmi configuration

import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

// Get project ID from environment
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "e3a2b903ffa3e74e8d1ce1c2a16e4e27";

// Wagmi configuration for AppKit
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  connectors: [
    injected(),
    walletConnect({
      projectId,
      metadata: {
        name: "Babylon Vault",
        description: "",
        url: "",
        icons: [""],
      },
    }),
  ],
});

// AppKit configuration placeholder
export const appKitConfig = {
  projectId,
  networks: [mainnet, sepolia],
  metadata: {
    name: "Babylon Vault",
    description: "",
    url: "",
    icons: [""],
  },
  features: {
    analytics: true,
    email: false, // Can be enabled later
    socials: false, // Can be enabled later
  },
};
