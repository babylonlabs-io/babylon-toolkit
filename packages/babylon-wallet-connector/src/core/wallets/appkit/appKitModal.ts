import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import type { Chain } from "viem";

import type { SharedBtcAppKitConfig } from "../btc/appkit/sharedConfig";
import { createETHWagmiAdapter } from "../eth/appkit/modal";

import {
  assertAppKitCapabilities,
  createAppKitCapabilities,
  getAppKitModal,
  getAppKitState,
  setAppKitState,
  validateAppKitInitialization,
} from "./state";

/**
 * Unified AppKit Modal Configuration
 *
 * This file provides a unified initialization point for both ETH and BTC AppKit adapters.
 * It creates a single AppKit modal instance that supports both chains.
 */

/**
 * Minimal AppKit configuration
 * Supports ETH-only, BTC-only, or unified ETH+BTC wallet connections
 */
export interface AppKitModalConfig {
  projectId?: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  /**
   * ETH configuration (optional)
   * Required only if you want to enable ETH wallet connections
   */
  eth?: {
    /**
     * ETH network chain configuration
     * Provide from your host application's network config.
     */
    chain: Chain;
  };
  /**
   * BTC configuration (optional)
   * Required only if you want to enable BTC wallet connections
   */
  btc?: {
    /**
     * BTC network (mainnet or signet)
     */
    network: "mainnet" | "signet";
  };
}

export { getAppKitModal };

/**
 * Initialize AppKit modal with ETH and/or BTC support
 * Creates a single AppKit instance with all configured adapters
 * This should be called once at the application level
 * @param config - Configuration including required metadata, optional ETH chain, and optional BTC network
 */
export function initializeAppKitModal(config: AppKitModalConfig) {
  if (!validateAppKitInitialization(config.projectId)) return null;

  const projectId = config.projectId;
  const metadata = config.metadata;
  const capabilities = createAppKitCapabilities({
    projectId,
    metadata,
    ethChain: config.eth?.chain,
    btcNetwork: config.btc?.network,
  });
  const existingState = getAppKitState<SharedBtcAppKitConfig>();

  if (existingState) {
    assertAppKitCapabilities(existingState, capabilities);

    return {
      modal: existingState.modal,
      wagmiConfig: existingState.wagmiConfig,
      bitcoinAdapter: existingState.btcConfig?.adapter ?? null,
    };
  }

  const allNetworks: AppKitNetwork[] = [];
  const adapters: (WagmiAdapter | BitcoinAdapter)[] = [];
  let wagmiAdapter: WagmiAdapter | null = null;
  let bitcoinAdapter: BitcoinAdapter | null = null;
  let btcConnectionEvents: EventTarget | undefined;

  // Create Wagmi Adapter if ETH is configured
  if (config.eth?.chain) {
    allNetworks.push(config.eth.chain);

    wagmiAdapter = createETHWagmiAdapter(config.eth.chain, projectId);

    adapters.push(wagmiAdapter);
  }

  // Create Bitcoin Adapter if BTC is configured
  if (config.btc?.network) {
    const btcNetwork = config.btc.network === "mainnet" ? bitcoin : bitcoinSignet;
    allNetworks.push(btcNetwork);

    bitcoinAdapter = new BitcoinAdapter({
      networks: [btcNetwork],
    });
    btcConnectionEvents = new EventTarget();

    adapters.push(bitcoinAdapter);
  }

  // Must have at least one network (ETH or BTC)
  if (allNetworks.length === 0) {
    return null;
  }

  // Create single AppKit modal with all adapters
  const appKitModal = createAppKit({
    adapters,
    networks: allNetworks as [AppKitNetwork, ...AppKitNetwork[]],
    projectId,
    metadata,
  });

  const initializedState = setAppKitState({
    modal: appKitModal,
    ...capabilities,
    wagmiConfig: wagmiAdapter?.wagmiConfig,
    btcConfig:
      bitcoinAdapter && config.btc?.network && btcConnectionEvents
        ? {
            modal: appKitModal,
            adapter: bitcoinAdapter,
            network: config.btc.network,
            connectionEvents: btcConnectionEvents,
          }
        : undefined,
  });

  return {
    modal: initializedState.modal,
    wagmiConfig: initializedState.wagmiConfig,
    bitcoinAdapter: initializedState.btcConfig?.adapter ?? null,
  };
}
