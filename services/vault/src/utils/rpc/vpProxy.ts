import { ENV } from "@/config/env";

import { ETH_ADDRESS_PATTERN } from "../validation";

/**
 * Build the RPC URL for a vault provider via the proxy service.
 *
 * The proxy resolves the VP's actual RPC endpoint from the on-chain
 * BTCVaultsMetadataRegistry, so callers only need the VP's Ethereum address.
 *
 * @param vpAddress - Vault provider Ethereum address (e.g. "0x1234...")
 * @returns Proxy URL: `${VP_PROXY_URL}/rpc/${vpAddress}`
 */
export function getVpProxyUrl(vpAddress: string): string {
  assertVpAddress(vpAddress);
  return `${ENV.VP_PROXY_URL}/rpc/${vpAddress}`;
}

/**
 * Build the base URL of a vault provider's HTTP artifact downloads via the
 * proxy service.
 *
 * @param vpAddress - Vault provider Ethereum address (e.g. "0x1234...")
 * @returns Proxy URL: `${VP_PROXY_URL}/artifacts/${vpAddress}`
 */
export function getVpArtifactsProxyUrl(vpAddress: string): string {
  assertVpAddress(vpAddress);
  return `${ENV.VP_PROXY_URL}/artifacts/${vpAddress}`;
}

function assertVpAddress(vpAddress: string): void {
  if (!vpAddress || !ETH_ADDRESS_PATTERN.test(vpAddress)) {
    throw new Error(
      `Invalid vault provider address: "${vpAddress}". Expected a 20-byte hex address starting with 0x.`,
    );
  }
}
