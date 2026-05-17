/** AppKit BTC network mapping. Single source of truth for both directions. */

import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";

import { Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

const APPKIT_PROVIDER_NAME = "AppKit";

const NETWORK_TO_CAIP_NETWORK = {
  mainnet: bitcoin,
  signet: bitcoinSignet,
} as const;

/** `Network` → AppKit caipNetwork (used by `adapter.switchNetwork`). */
export function getCaipNetworkForNetwork(
  network: "mainnet" | "signet",
): typeof bitcoin | typeof bitcoinSignet {
  return NETWORK_TO_CAIP_NETWORK[network];
}

function caipNetworkIdToNetwork(
  caipNetworkId: string | undefined,
): Network | null {
  if (caipNetworkId === bitcoin.caipNetworkId) return Network.MAINNET;
  if (caipNetworkId === bitcoinSignet.caipNetworkId) return Network.SIGNET;
  return null;
}

/**
 * Resolve the live BTC network. Undefined `caipNetworkId` → trust
 * config (some adapters never populate it). Defined-but-unsupported
 * or mismatched-from-config → throw `UNSUPPORTED_NETWORK`.
 */
export function resolveLiveNetwork(
  caipNetworkId: string | undefined,
  configuredNetwork: Network,
): Network {
  if (caipNetworkId === undefined) {
    return configuredNetwork;
  }

  const liveNetwork = caipNetworkIdToNetwork(caipNetworkId);
  if (liveNetwork === null) {
    throw new WalletError({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message:
        `AppKit Bitcoin wallet is on an unsupported network ` +
        `(caipNetworkId="${caipNetworkId}")`,
      wallet: APPKIT_PROVIDER_NAME,
    });
  }

  if (liveNetwork !== configuredNetwork) {
    throw new WalletError({
      code: ERROR_CODES.UNSUPPORTED_NETWORK,
      message:
        `AppKit Bitcoin wallet network mismatch: app expects ` +
        `${configuredNetwork}, wallet is on ${liveNetwork}`,
      wallet: APPKIT_PROVIDER_NAME,
    });
  }

  return liveNetwork;
}
