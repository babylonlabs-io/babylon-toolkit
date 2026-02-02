/**
 * Provider Icon Service
 *
 * Constructs icon URLs for vault providers using the icon service.
 * Icons are served from S3 via the configured icon service URL.
 *
 * @see NEXT_PUBLIC_ICON_SERVICE_URL environment variable
 */

const ICON_SERVICE_URL = process.env.NEXT_PUBLIC_ICON_SERVICE_URL ?? "";

/**
 * Generates the icon URL for a vault provider.
 *
 * @param providerId - The provider's Ethereum address
 * @returns The full URL to the provider's icon image, or undefined if the
 *          icon service is not configured or providerId is empty
 *
 * @example
 * // With NEXT_PUBLIC_ICON_SERVICE_URL="https://icons.babylonlabs.io"
 * getProviderIconUrl("0xABC123...")
 * // Returns: "https://icons.babylonlabs.io/providers/0xabc123....png"
 *
 * @example
 * // Without NEXT_PUBLIC_ICON_SERVICE_URL configured
 * getProviderIconUrl("0xABC123...")
 * // Returns: undefined
 */
export function getProviderIconUrl(providerId: string): string | undefined {
  if (!ICON_SERVICE_URL || !providerId) {
    return undefined;
  }

  return `${ICON_SERVICE_URL}/providers/${providerId.toLowerCase()}.png`;
}
