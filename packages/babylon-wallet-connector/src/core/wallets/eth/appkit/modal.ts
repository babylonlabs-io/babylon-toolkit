import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit, modal as reownAppKitModal } from "@reown/appkit/react";
import { http, type Chain } from "viem";
import { cookieStorage, createStorage, type CreateStorageParameters } from "wagmi";
import { baseAccount } from "wagmi/connectors";

import {
  assertAppKitCapabilities,
  createAppKitCapabilities,
  failInitialization,
  getAppKitState,
  setAppKitState,
  validateAppKitInitialization,
} from "@/core/wallets/appkit/state";

import { getSharedWagmiConfig } from "./sharedConfig";

/** Where wagmi keeps the Ethereum connection state between visits. */
export type ETHConnectionStorage = NonNullable<CreateStorageParameters["storage"]>;

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
 * Builds the Ethereum adapter.
 *
 * The unified (ETH+BTC) initializer calls this too, so the Ethereum half of
 * AppKit is set up in exactly one place regardless of which entry point the
 * host imported.
 *
 * The connection state goes to cookies unless the host passes its own storage,
 * for example one that honours the visitor's cookie consent.
 */
export function createETHWagmiAdapter(
  chain: Chain,
  projectId: string,
  storage: ETHConnectionStorage = cookieStorage,
): WagmiAdapter {
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
    storage: createStorage({ storage }),
    connectors: [baseAccount({ preference: { telemetry: false } })],
    transports: {
      [chain.id]: http(ethRpcUrl),
    },
  });

  return adapter;
}

/**
 * Initializes an Ethereum-only AppKit instance. Imports no Bitcoin adapter and
 * no Bitcoin network definitions, so it is safe to reach from the `./eth`
 * entry point.
 */
export function initializeAppKitModal(config: AppKitModalConfig) {
  if (!validateAppKitInitialization(config.projectId)) return null;

  const { chain } = config.eth;
  const capabilities = createAppKitCapabilities({
    projectId: config.projectId,
    metadata: config.metadata,
    ethChain: chain,
  });
  const existingState = getAppKitState();

  if (existingState) {
    assertAppKitCapabilities(existingState, capabilities);
    return { modal: existingState.modal, wagmiConfig: getSharedWagmiConfig() };
  }

  if (reownAppKitModal)
    failInitialization("Reown AppKit was initialized outside this package. Use only this package to initialize it.");

  const wagmiAdapter = createETHWagmiAdapter(chain, config.projectId);

  const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [chain],
    projectId: config.projectId,
    metadata: config.metadata,
    // AppKit analytics off, as in the combined modal (`appKitModal.ts`).
    features: { email: false, socials: false, analytics: false },
  });
  const initializedState = setAppKitState({ modal, ...capabilities, wagmiConfig: wagmiAdapter.wagmiConfig });

  return { modal: initializedState.modal, wagmiConfig: wagmiAdapter.wagmiConfig };
}
