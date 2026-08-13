import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { http, type Chain } from "viem";
import { cookieStorage, createStorage } from "wagmi";
import { baseAccount } from "wagmi/connectors";

import { getAppKitModal, setAppKitModal } from "@/core/wallets/appkit/state";

import { getSharedWagmiConfig, hasSharedWagmiConfig, setSharedWagmiConfig } from "./sharedConfig";

export interface ETHAppKitModalConfig {
  projectId?: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  eth: {
    chain: Chain;
  };
}

/**
 * Initializes an ETH-only AppKit instance without importing the Bitcoin
 * adapter or Bitcoin network definitions. Use this from the `./eth` entry.
 */
export function initializeETHAppKitModal(config: ETHAppKitModalConfig) {
  const existingModal = getAppKitModal();
  if (existingModal) {
    return {
      modal: existingModal,
      wagmiConfig: hasSharedWagmiConfig() ? getSharedWagmiConfig() : undefined,
    };
  }

  if (!config.projectId) return null;

  const { chain } = config.eth;
  const storage = createStorage({ storage: cookieStorage });
  const ethRpcUrl = chain.rpcUrls.default.http[0];
  const wagmiAdapter = new WagmiAdapter({
    networks: [chain],
    projectId: config.projectId,
    ssr: false,
    storage,
    connectors: [baseAccount({ preference: { telemetry: false } })],
    transports: {
      [chain.id]: http(ethRpcUrl),
    },
  });

  setSharedWagmiConfig(wagmiAdapter.wagmiConfig);
  const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [chain],
    projectId: config.projectId,
    metadata: config.metadata,
  });
  setAppKitModal(modal);

  return { modal, wagmiConfig: wagmiAdapter.wagmiConfig };
}
