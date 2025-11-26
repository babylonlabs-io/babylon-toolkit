/**
 * Vault Provider Metadata Registry
 *
 * Static registry of vault provider metadata keyed by provider address (lowercase).
 * This supplements GraphQL data with additional details not available from on-chain events.
 */

export interface VaultProviderMetadata {
  /** Provider's RPC URL for signing requests */
  url: string;
}

/**
 * Registry of known vault providers, keyed by lowercase provider address
 */
export const VAULT_PROVIDER_REGISTRY: Record<string, VaultProviderMetadata> = {
  "0xe650c9bd9be8755cf1df382f668741ab3d1ff11c": {
    url: "https://btc-vault-api.vault-devnet.babylonlabs.io",
  },
};

/**
 * Get vault provider metadata by provider address
 *
 * @throws Error if provider is not found in the registry
 */
export function getVaultProviderMetadata(
  providerAddress: string,
): VaultProviderMetadata {
  const metadata = VAULT_PROVIDER_REGISTRY[providerAddress.toLowerCase()];
  if (!metadata) {
    throw new Error(
      `Vault provider ${providerAddress} not found in registry. Please add the provider metadata.`,
    );
  }
  return metadata;
}
