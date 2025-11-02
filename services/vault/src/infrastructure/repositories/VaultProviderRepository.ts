import { vaultApiClient } from "../../clients/vault-api";
import { IVaultProviderRepository } from "../../domain/repositories/IVaultProviderRepository";
import { VaultProvider } from "../../domain/value-objects/VaultProvider";

/**
 * Implementation of IVaultProviderRepository using the Vault API.
 */
export class VaultProviderRepository implements IVaultProviderRepository {
  // Cache providers for performance
  private providersCache: VaultProvider[] | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async findAll(): Promise<VaultProvider[]> {
    // Check cache
    if (this.providersCache && Date.now() < this.cacheExpiry) {
      return this.providersCache;
    }

    // Fetch from API
    const apiProviders = await vaultApiClient.getProviders();

    // Convert to domain objects
    this.providersCache = apiProviders.map(
      (provider) =>
        new VaultProvider(
          provider.id,
          provider.btc_pubkey,
          provider.name || "Unknown Provider",
          provider.description,
        ),
    );

    // Update cache expiry
    this.cacheExpiry = Date.now() + this.CACHE_DURATION;

    return this.providersCache;
  }

  async findById(id: string): Promise<VaultProvider | null> {
    const providers = await this.findAll();
    return providers.find((p) => p.getId() === id) || null;
  }

  async findByBtcPublicKey(publicKey: string): Promise<VaultProvider | null> {
    const providers = await this.findAll();
    return providers.find((p) => p.getBtcPublicKey() === publicKey) || null;
  }

  async findActive(): Promise<VaultProvider[]> {
    // For now, all providers are considered active
    // In production, you might have an 'active' flag in the API response
    return this.findAll();
  }

  /**
   * Clear the cache (useful for testing or when data changes).
   */
  clearCache(): void {
    this.providersCache = null;
    this.cacheExpiry = 0;
  }
}
