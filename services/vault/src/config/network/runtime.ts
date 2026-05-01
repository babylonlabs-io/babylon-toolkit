/**
 * Vault network configuration runtime.
 *
 * Reads no environment variables on its own. The host (vault `main.tsx` /
 * `config/env.ts`) calls {@link configureBabylonConfig} once at startup
 * with values it has already validated, then any `getX()` reader can be
 * used elsewhere in the app.
 *
 * Lives inside the vault service rather than in a workspace package
 * because vault is the only consumer. If a second consumer ever appears
 * the same shape can be promoted to a package without rewriting it.
 */

import type { BtcNetworkName } from "./btc";
import {
  BTC_MAINNET,
  BTC_SIGNET,
  ETH_MAINNET_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
} from "./constants";

export type EthChainId =
  | typeof ETH_MAINNET_CHAIN_ID
  | typeof ETH_SEPOLIA_CHAIN_ID;

export type { BtcNetworkName };

export interface BabylonConfigOptions {
  /** Ethereum chain ID. Must be 1 (mainnet) or 11155111 (sepolia). */
  ethChainId: EthChainId;

  /**
   * Ethereum RPC endpoint. Required — must point at an RPC that can see
   * the deployed contracts. Public RPCs (drpc.org, publicnode.com) do
   * not see contracts on private/devnet deployments.
   */
  ethRpcUrl: string;

  /** Bitcoin network. Must be "mainnet" or "signet". */
  btcNetwork: BtcNetworkName;

  /** Optional mempool API base URL. Defaults to `https://mempool.space`. */
  mempoolApiUrl?: string;
}

export interface BabylonConfigState {
  ethChainId: EthChainId;
  ethRpcUrl: string;
  btcNetwork: BtcNetworkName;
  mempoolApiUrl: string;
}

const DEFAULT_MEMPOOL_API_URL = "https://mempool.space";

let state: BabylonConfigState | null = null;

const VALID_PAIRINGS: Array<{
  btc: BtcNetworkName;
  eth: EthChainId;
}> = [
  { btc: BTC_MAINNET, eth: ETH_MAINNET_CHAIN_ID },
  { btc: BTC_SIGNET, eth: ETH_SEPOLIA_CHAIN_ID },
];

/**
 * Initialize the runtime. Call once at startup before any reader runs.
 *
 * Calling more than once throws — silent re-init would let cached
 * singletons (e.g. `ethClient`) drift from the new state. Tests that
 * need to reconfigure must call `_resetBabylonConfigForTests` first.
 *
 * @throws if `configureBabylonConfig` has already been called.
 * @throws if any field is invalid or if the BTC/ETH pairing is not a known
 *   safe combination (mainnet+1, signet+11155111).
 */
export function configureBabylonConfig(opts: BabylonConfigOptions): void {
  if (state !== null) {
    throw new Error(
      "configureBabylonConfig() has already been called. " +
        "Call `_resetBabylonConfigForTests()` first if you need to reconfigure in tests.",
    );
  }
  if (
    opts.ethChainId !== ETH_MAINNET_CHAIN_ID &&
    opts.ethChainId !== ETH_SEPOLIA_CHAIN_ID
  ) {
    throw new Error(
      `Unsupported ethChainId: ${opts.ethChainId}. Must be ${ETH_MAINNET_CHAIN_ID} (mainnet) or ${ETH_SEPOLIA_CHAIN_ID} (sepolia).`,
    );
  }
  if (!opts.ethRpcUrl) {
    throw new Error(
      "ethRpcUrl is required. Set it to an RPC endpoint that can see the deployed contracts.",
    );
  }
  if (opts.btcNetwork !== BTC_MAINNET && opts.btcNetwork !== BTC_SIGNET) {
    throw new Error(
      `Invalid btcNetwork: "${opts.btcNetwork}". Must be 'mainnet' or 'signet'.`,
    );
  }

  const isPaired = VALID_PAIRINGS.some(
    (p) => p.btc === opts.btcNetwork && p.eth === opts.ethChainId,
  );
  if (!isPaired) {
    throw new Error(
      `Invalid network pairing: btcNetwork="${opts.btcNetwork}" with ethChainId=${opts.ethChainId}. ` +
        `Allowed pairings: mainnet+1 (production), signet+11155111 (testnet).`,
    );
  }

  state = {
    ethChainId: opts.ethChainId,
    ethRpcUrl: opts.ethRpcUrl,
    btcNetwork: opts.btcNetwork,
    mempoolApiUrl: opts.mempoolApiUrl ?? DEFAULT_MEMPOOL_API_URL,
  };
}

/**
 * Read the runtime config. Throws if `configureBabylonConfig` has not run.
 *
 * @internal
 */
export function getBabylonConfigState(): BabylonConfigState {
  if (!state) {
    throw new Error(
      "vault network config: configureBabylonConfig() has not been called. " +
        "Call it once at application startup before reading any config value.",
    );
  }
  return state;
}

/** @internal — for tests only. */
export function _resetBabylonConfigForTests(): void {
  state = null;
}
