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
  if (!ENV.VP_PROXY_URL) {
    throw new Error(
      "VP_PROXY_URL is not configured. Set NEXT_PUBLIC_TBV_VP_PROXY_URL.",
    );
  }
  if (!vpAddress || !ETH_ADDRESS_PATTERN.test(vpAddress)) {
    throw new Error(
      `Invalid vault provider address: "${vpAddress}". Expected a 20-byte hex address starting with 0x.`,
    );
  }
  return `${ENV.VP_PROXY_URL}/rpc/${vpAddress}`;
}
