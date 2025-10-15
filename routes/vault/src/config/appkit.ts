import { setSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import { getETHNetworkConfig } from "@babylonlabs-io/config";
import { http } from "viem";
import { createConfig, type Config } from "wagmi";
import { injected, walletConnect } from "@wagmi/connectors";

// Create basic wagmi config without WagmiAdapter
// WagmiAdapter has a bug in production that causes "Cannot set properties of undefined"
function createWagmiConfig(): Config {
  const { config: ethConfig, chain: activeChain } = getETHNetworkConfig();

  console.log("Creating wagmi config with WalletConnect support");

  // Create wagmi config with multiple connectors (works in production)
  return createConfig({
    chains: [activeChain as any],
    connectors: [
      injected({ shimDisconnect: true }),
      walletConnect({
        projectId: "9b1a9564f91cb6595f6e23f0d35a0046",
        showQrModal: true,
        metadata: {
          name: "Babylon Vault",
          description: "Babylon Bitcoin Vault",
          url: typeof window !== "undefined" ? window.location.origin : "https://btcstaking.babylonlabs.io",
          icons: ["https://btcstaking.babylonlabs.io/favicon.ico"],
        },
      }),
    ],
    transports: {
      [activeChain.id]: http(ethConfig.rpcUrl),
    },
  }) as unknown as Config;
}

// Create wagmi config immediately (synchronous, works in production)
const config = typeof window !== "undefined" ? createWagmiConfig() : ({} as Config);

// Set the shared wagmi config
if (typeof window !== "undefined") {
  setSharedWagmiConfig(config);
}

// Export wagmi config
export const wagmiConfig: Config = config;

// We're using wagmi connectors directly instead of AppKit
// This avoids the WagmiAdapter bug while still providing WalletConnect support
console.log("Using wagmi with WalletConnect connector (no AppKit UI)");
