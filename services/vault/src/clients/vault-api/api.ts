/**
 * Vault Indexer API Client
 *
 * REST API client for querying vault and market information from the Babylon vault indexer.
 *
 */

import { RestClient } from "../../utils/rest-client";
import type { MorphoMarket, Vault, VaultProvider } from "./types";

export class VaultApiClient {
  private client: RestClient;

  constructor(baseUrl: string, timeout: number = 30000) {
    this.client = new RestClient({
      baseUrl,
      timeout,
    });
  }

  /**
   * Get all Morpho markets
   * @returns Array of Morpho market configurations
   */
  async getMarkets(): Promise<MorphoMarket[]> {
    return this.client.get<MorphoMarket[]>("/v1/markets");
  }

  /**
   * Get all registered vault providers
   * @returns Array of vault provider information
   */
  async getProviders(): Promise<VaultProvider[]> {
    return this.client.get<VaultProvider[]>("/v1/providers");
  }

  /**
   * Get vault details by ID
   * @param id - Vault ID (pegin transaction hash)
   * @returns Vault information
   */
  async getVault(id: string): Promise<Vault> {
    return this.client.get<Vault>(`/v1/vault/${id}`);
  }
}
