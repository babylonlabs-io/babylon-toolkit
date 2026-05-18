/**
 * Wagmi Configuration for Vault Application
 *
 * This file initializes AppKit modal (which creates wagmi config internally)
 * and exports the wagmi config for use in the application-level WagmiProvider.
 *
 * Since the vault uses AppKit for ETH wallet connections, we let AppKit create
 * the wagmi config to ensure compatibility.
 *
 * E2E mode (NEXT_PUBLIC_E2E_MODE=1) takes a different path: it skips
 * AppKit entirely and builds a wagmi config whose only connector is
 * wagmi's `mock`. The shared config that `AppKitProvider` reads is
 * still populated via `setSharedWagmiConfig`, so the rest of the app
 * code (which calls into wagmi via that provider) keeps working
 * without knowing the connector underneath is faked. The mock account
 * comes from a deterministic test address pinned below.
 */

import {
  initializeAppKitModal,
  setSharedWagmiConfig,
  type AppKitModalConfig,
} from "@babylonlabs-io/wallet-connector";
import { createConfig, http } from "wagmi";
import { connect } from "wagmi/actions";
import { mock } from "wagmi/connectors";

import { getETHChain, getNetworkConfigETH } from "@/config/network";

const IS_E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE === "1";

/**
 * Deterministic ETH account exposed to wagmi in e2e mode. The address
 * is derived from the same all-`ab` private key the e2e mock ETH
 * wallet uses (`services/vault/e2e/fixtures/mockEthWallet.ts`), so
 * signatures and addresses line up across fixtures and page-side
 * state.
 */
const E2E_DEFAULT_ETH_ADDRESS =
  "0xe239cdc5fbe977a8a141B72194D3CF8c41bC5BC6" as `0x${string}`;

interface WagmiInitResult {
  wagmiConfig: ReturnType<typeof createConfig>;
  error: string | null;
}

/**
 * Initialize AppKit modal and get the wagmi config it creates
 *
 * This must be called before the app renders to ensure wagmi config is available.
 * If initialization fails, returns a fallback config and tracks the error.
 */
function initializeVaultWagmi(): WagmiInitResult {
  try {
    const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

    if (!projectId) {
      return {
        wagmiConfig: createFallbackConfig(),
        error:
          "NEXT_PUBLIC_REOWN_PROJECT_ID environment variable is required. " +
          "Please set it in your .env file or environment configuration.",
      };
    }

    const appKitConfig: AppKitModalConfig = {
      projectId,
      metadata: {
        name: "Babylon Vault",
        description: "Babylon Vault - Secure Bitcoin Vault Platform",
        url:
          typeof window !== "undefined"
            ? window.location.origin
            : "https://staking.vault-devnet.babylonlabs.io",
        icons: [
          typeof window !== "undefined"
            ? `${window.location.origin}/favicon.ico`
            : "https://btcstaking.babylonlabs.io/favicon.ico",
        ],
      },
      eth: {
        chain: getETHChain(),
      },
    };

    const result = initializeAppKitModal(appKitConfig);

    if (!result || !result.wagmiConfig) {
      return {
        wagmiConfig: createFallbackConfig(),
        error: "Failed to initialize AppKit modal or wagmi config not created",
      };
    }

    return {
      wagmiConfig: result.wagmiConfig,
      error: null,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown initialization error";

    return {
      wagmiConfig: createFallbackConfig(),
      error: errorMessage,
    };
  }
}

/**
 * Create a minimal fallback wagmi config for error states.
 *
 * Uses the env-configured RPC URL rather than viem's stock chain default,
 * so reads/writes hit the same endpoint that can see the deployed
 * contracts even when AppKit initialization fails.
 */
function createFallbackConfig() {
  const chain = getETHChain();
  const { rpcUrl } = getNetworkConfigETH();
  return createConfig({
    chains: [chain],
    transports: {
      [chain.id]: http(rpcUrl),
    },
  });
}

/**
 * E2E wagmi init: skip AppKit, drop in a mock connector, and push the
 * resulting config into the wallet-connector's shared singleton so
 * AppKitProvider keeps using the same wagmi instance. Auto-connect
 * fires on the next microtask so the page hydrates with a wagmi
 * account already present — AppKitProvider's `setupEventWatchers`
 * picks it up and emits the connection event the rest of the stack
 * listens to.
 */
function getE2EAccountAddress(): `0x${string}` {
  if (typeof window === "undefined") return E2E_DEFAULT_ETH_ADDRESS;
  const override = (
    window as unknown as { __BABYLON_E2E_ETH_ADDRESS__?: string }
  ).__BABYLON_E2E_ETH_ADDRESS__;
  if (typeof override === "string" && /^0x[0-9a-fA-F]{40}$/.test(override)) {
    return override as `0x${string}`;
  }
  return E2E_DEFAULT_ETH_ADDRESS;
}

function initializeE2EWagmi(): WagmiInitResult {
  const chain = getETHChain();
  const { rpcUrl } = getNetworkConfigETH();
  const e2eAddress = getE2EAccountAddress();
  const mockConnector = mock({
    accounts: [e2eAddress],
    features: { reconnect: true },
  });
  const config = createConfig({
    chains: [chain],
    transports: { [chain.id]: http(rpcUrl) },
    connectors: [mockConnector],
  });
  setSharedWagmiConfig(config);
  if (typeof window !== "undefined") {
    queueMicrotask(async () => {
      try {
        const instance = config.connectors.find((c) => c.id === "mock");
        if (instance) {
          await connect(config, { connector: instance });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          "[e2e] Mock ETH auto-connect failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    });
  }
  return { wagmiConfig: config, error: null };
}

const initResult = IS_E2E_MODE ? initializeE2EWagmi() : initializeVaultWagmi();

/**
 * Singleton wagmi config instance
 * Created by AppKit initialization at module load time
 *
 * If initialization failed, this will be a fallback config and wagmiInitError will be set.
 */
export const vaultWagmiConfig = initResult.wagmiConfig;

/**
 * Error message if wagmi initialization failed, null otherwise
 */
export const wagmiInitError = initResult.error;
