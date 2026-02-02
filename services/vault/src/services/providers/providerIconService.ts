/**
 * Provider Icon Service
 *
 * Constructs icon URLs for vault providers using the staking API.
 * Icons are served from S3 via the same API used by simple-staking.
 *
 * @see NEXT_PUBLIC_API_URL environment variable
 */

function getApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

/**
 * Generates the icon URL for a vault provider.
 *
 * @param providerId - The provider's Ethereum address
 * @returns The full URL to the provider's icon image, or undefined if the
 *          API URL is not configured or providerId is empty
 *
 * @example
 * // With NEXT_PUBLIC_API_URL="https://staking-api.testnet.babylonlabs.io"
 * getProviderIconUrl("0xABC123...")
 * // Returns: "https://staking-api.testnet.babylonlabs.io/v1/icons/providers/0xabc123....png"
 *
 * @example
 * // Without NEXT_PUBLIC_API_URL configured
 * getProviderIconUrl("0xABC123...")
 * // Returns: undefined
 */
export function getProviderIconUrl(providerId: string): string | undefined {
  const apiUrl = getApiUrl();

  if (!apiUrl || !providerId) {
    return undefined;
  }

  return `${apiUrl}/v1/icons/providers/${providerId.toLowerCase()}.png`;
}
