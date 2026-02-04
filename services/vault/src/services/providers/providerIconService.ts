import { ENV } from "@/config";

/**
 * Generates the icon URL for a vault provider.
 *
 * @param providerId - The provider's Ethereum address
 * @returns The full URL to the provider's icon image, or undefined if the
 *          API URL is not configured or providerId is empty
 *
 * @example
 * getProviderIconUrl("0xABC123...")
 * // Returns: "https://staking-api.testnet.babylonlabs.io/v1/icons/providers/0xabc123....png"
 *
 * @example
 * // Without API URL configured
 * getProviderIconUrl("0xABC123...")
 * // Returns: undefined
 */
export function getProviderIconUrl(providerId: string): string | undefined {
  if (!ENV.API_URL || !providerId) {
    return undefined;
  }

  return `${ENV.API_URL}/v1/icons/providers/${providerId.toLowerCase()}.png`;
}
