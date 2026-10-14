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
import { assertPairingAllowed, type ProfileKind } from "./profile";

export type EthChainId =
  | typeof ETH_MAINNET_CHAIN_ID
  | typeof ETH_SEPOLIA_CHAIN_ID;

export type { BtcNetworkName };

export interface BabylonConfigOptions {
  /** Deployment class from the network profile; decides the allowed pairing and the badge. */
  kind: ProfileKind;

  /** Profile name, e.g. "devnet"; shown in diagnostics only. */
  networkName: string;

  /** Ethereum chain ID. 1 or 11155111; which one is legal depends on `kind`. */
  ethChainId: EthChainId;

  /**
   * Ethereum RPC endpoint. Required — must point at an RPC that can see
   * the deployed contracts. Public RPCs (drpc.org, publicnode.com) do
   * not see contracts on private/devnet deployments.
   */
  ethRpcUrl: string;

  /** Bitcoin network. Must be "mainnet" or "signet". */
  btcNetwork: BtcNetworkName;

  /**
   * Optional mempool host base URL — WITHOUT the `/signet` network path or a
   * trailing `/api`. For signet, `/signet` is appended from `btcNetwork`; the
   * reader appends `/api`. Defaults to mempool.space when omitted.
   * See {@link resolveMempoolApiUrl}.
   */
  mempoolApiUrl?: string;
}

export interface BabylonConfigState {
  kind: ProfileKind;
  networkName: string;
  ethChainId: EthChainId;
  ethRpcUrl: string;
  btcNetwork: BtcNetworkName;
  mempoolApiUrl: string;
}

// Default mempool host when NEXT_PUBLIC_MEMPOOL_API is unset.
const DEFAULT_MEMPOOL_HOST = "https://mempool.space";

/**
 * Resolve the mempool API base URL (WITHOUT a trailing `/api`) for the declared
 * BTC network.
 *
 * Every mempool host we use — public mempool.space and the babylon proxy alike —
 * serves signet under a `/signet` path (mainnet is at the root), so `/signet` is
 * appended for signet regardless of host. It is appended idempotently: a base
 * that already ends in `/signet` is left as-is, so it can never double to
 * `.../signet/signet`.
 */
export function resolveMempoolApiUrl(
  base: string | undefined,
  network: BtcNetworkName,
): string {
  const trimmed = (base ?? DEFAULT_MEMPOOL_HOST).replace(/\/+$/, "");
  if (network !== BTC_SIGNET) return trimmed;
  return trimmed.endsWith("/signet") ? trimmed : `${trimmed}/signet`;
}

let state: BabylonConfigState | null = null;

/**
 * Initialize the runtime. Call once at startup before any reader runs.
 *
 * Calling more than once throws — silent re-init would let cached
 * singletons (e.g. `ethClient`) drift from the new state.
 *
 * @throws if `configureBabylonConfig` has already been called.
 * @throws if any field is invalid or if the BTC/ETH pairing is not the one
 *   allowed for the profile's kind (see assertPairingAllowed).
 */
export function configureBabylonConfig(opts: BabylonConfigOptions): void {
  if (state !== null) {
    throw new Error(
      "configureBabylonConfig() has already been called; it can only be configured once.",
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

  assertPairingAllowed(opts);

  state = {
    kind: opts.kind,
    networkName: opts.networkName,
    ethChainId: opts.ethChainId,
    ethRpcUrl: opts.ethRpcUrl,
    btcNetwork: opts.btcNetwork,
    mempoolApiUrl: resolveMempoolApiUrl(opts.mempoolApiUrl, opts.btcNetwork),
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

/** Deployment class of the running profile (production, test or internal). */
export function getDeploymentKind(): ProfileKind {
  return getBabylonConfigState().kind;
}

/** Name of the running profile, e.g. "devnet". */
export function getNetworkName(): string {
  return getBabylonConfigState().networkName;
}
