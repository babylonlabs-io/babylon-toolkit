import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { http, type Chain } from "viem";
import { cookieStorage, createStorage } from "wagmi";
import { baseAccount } from "wagmi/connectors";

import { getAppKitModal, setAppKitModal } from "@/core/wallets/appkit/state";

import { getSharedWagmiConfig, hasSharedWagmiConfig, setSharedWagmiConfig } from "./sharedConfig";

export interface AppKitMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

export interface AppKitModalConfig {
  projectId?: string;
  metadata: AppKitMetadata;
  eth: {
    /** ETH network chain configuration, from the host application's network config. */
    chain: Chain;
  };
}

/**
 * Builds the Ethereum adapter and publishes its wagmi config.
 *
 * The unified (ETH+BTC) initializer calls this too, so the Ethereum half of
 * AppKit is set up in exactly one place regardless of which entry point the
 * host imported.
 */
export function createETHWagmiAdapter(chain: Chain, projectId: string): WagmiAdapter {
  // Pin the transport to the chain's configured RPC URL. Without this, wagmi
  // falls back to viem's bundled public RPC (e.g. sepolia.drpc.org) which
  // doesn't see contracts on private/devnet deployments.
  const ethRpcUrl = chain.rpcUrls.default.http[0];
  // Supply the Base Account connector ourselves so AppKit skips constructing
  // its own default one. Its default enables the Base Account SDK's telemetry,
  // which injects an inline analytics script into the page.
  const adapter = new WagmiAdapter({
    networks: [chain],
    projectId,
    ssr: false,
    storage: createStorage({ storage: cookieStorage }),
    connectors: [baseAccount({ preference: { telemetry: false } })],
    transports: {
      [chain.id]: http(ethRpcUrl),
    },
  });

  setSharedWagmiConfig(adapter.wagmiConfig);

  return adapter;
}

/**
 * Initializes an Ethereum-only AppKit instance. Imports no Bitcoin adapter and
 * no Bitcoin network definitions, so it is safe to reach from the `./eth`
 * entry point.
 */
export function initializeAppKitModal(config: AppKitModalConfig) {
  const existingModal = getAppKitModal();
  if (existingModal) {
    return {
      modal: existingModal,
      wagmiConfig: hasSharedWagmiConfig() ? getSharedWagmiConfig() : undefined,
    };
  }

  if (!config.projectId) return null;

  const { chain } = config.eth;
  const wagmiAdapter = createETHWagmiAdapter(chain, config.projectId);

  const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [chain],
    projectId: config.projectId,
    metadata: config.metadata,
  });
  setAppKitModal(modal);

  return { modal, wagmiConfig: wagmiAdapter.wagmiConfig };
}
